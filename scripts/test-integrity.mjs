#!/usr/bin/env node
// Test-integrity gate: inspects what a diff adds or removes, never existing code.
//
//   node scripts/test-integrity.mjs [--json] <base> [head]     (head defaults to HEAD)
//
// Exits 1 when any failRules finding exists, 0 otherwise. reportRules findings
// never fail the check; the door script reads them to mark the PR one-way.
// --json prints { fail, oneWay } instead of one line per finding.
import { execFileSync } from "node:child_process";
import { appendFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { removalRules } from "./integrity/removals.mjs";
import { thresholdRules } from "./integrity/thresholds.mjs";

/**
 * @typedef {{ line: number, text: string }} DiffLine  1-based line number and the text without its diff marker
 * @typedef {{
 *   path: string,            // path at head; for a deleted file, its path at base
 *   oldPath: string | null,  // path at base; null for an added file
 *   status: "added" | "deleted" | "modified" | "renamed",
 *   added: DiffLine[],       // numbered in the head file
 *   removed: DiffLine[],     // numbered in the base file
 * }} DiffFile
 * @typedef {{
 *   rule: string,
 *   file: string,
 *   line: number | null,     // null for a whole-file finding
 *   key?: string,            // threshold findings only: the config key, with its value at base and at head
 *   old?: number | string,
 *   new?: number | string,
 * }} Finding
 * @typedef {{ readFile: (ref: "base" | "head", path: string) => string | null }} Context
 * @typedef {(files: DiffFile[], ctx: Context) => Finding[]} Rule
 */

const QUOTED = /"(?:[^"\\]|\\.)*"/.source;
// Either side of a file header is quoted on its own; an unquoted side never holds a quote.
const HEADER = new RegExp(`^(${QUOTED}|a/[^"]+?) (${QUOTED}|b/[^"]+)$`);
const ESCAPES = { a: "\x07", b: "\b", t: "\t", n: "\n", v: "\v", f: "\f", r: "\r" };

/**
 * Undoes the C-style quoting git gives a path that holds a quote, a backslash or a control character.
 * @param {string} path
 */
function unquote(path) {
  if (!path.startsWith('"')) return path;
  return path
    .slice(1, -1)
    .replace(/\\([0-7]{3}|.)/g, (_, c) => (c.length === 3 ? String.fromCharCode(parseInt(c, 8)) : (ESCAPES[c] ?? c)));
}

/**
 * Parses `git diff` unified output.
 * @param {string} text
 * @returns {DiffFile[]}
 */
export function parseDiff(text) {
  const files = [];
  let file = null;
  // Lines left in the current hunk on each side: inside a hunk every line is content, whatever it looks like.
  let oldLeft = 0;
  let newLeft = 0;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of text.split("\n")) {
    if (file && (oldLeft > 0 || newLeft > 0)) {
      const marker = raw[0];
      if (marker === "+") {
        file.added.push({ line: newLine++, text: raw.slice(1) });
        newLeft--;
      } else if (marker === "-") {
        file.removed.push({ line: oldLine++, text: raw.slice(1) });
        oldLeft--;
      } else if (marker !== "\\") {
        oldLine++;
        newLine++;
        oldLeft--;
        newLeft--;
      }
      continue;
    }

    if (raw.startsWith("diff --git ")) {
      const rest = raw.slice("diff --git ".length);
      const same = /^a\/([^"]+) b\/\1$/.exec(rest);
      const differ = same ? null : HEADER.exec(rest);
      // A header that cannot be read must stop the check: skipping the file would pass whatever it adds.
      if (!same && !differ) throw new Error(`unrecognised file header: ${raw}`);
      const oldPath = same ? same[1] : unquote(differ[1]).slice(2);
      const path = same ? same[1] : unquote(differ[2]).slice(2);
      file = { path, oldPath, status: "modified", added: [], removed: [] };
      files.push(file);
    } else if (!file) {
      continue;
    } else if (raw.startsWith("new file mode")) {
      file.status = "added";
      file.oldPath = null;
    } else if (raw.startsWith("deleted file mode")) {
      file.status = "deleted";
    } else if (raw.startsWith("rename from ")) {
      file.status = "renamed";
      file.oldPath = unquote(raw.slice("rename from ".length));
    } else if (raw.startsWith("rename to ")) {
      file.path = unquote(raw.slice("rename to ".length));
    } else {
      const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(raw);
      if (hunk) {
        oldLine = Number(hunk[1]);
        oldLeft = hunk[2] === undefined ? 1 : Number(hunk[2]);
        newLine = Number(hunk[3]);
        newLeft = hunk[4] === undefined ? 1 : Number(hunk[4]);
      }
    }
  }
  return files;
}

/**
 * The gate's own source and tests: their fixtures contain the very strings it detects.
 * @param {string} path
 */
export function isExempt(path) {
  return /^scripts\/(test-integrity[^/]*\.mjs$|integrity\/)/.test(path);
}

const CODE_FILE = /\.[cm]?[jt]sx?$/;

/**
 * A rule that finds `pattern` on lines added to JavaScript or TypeScript files.
 * @param {string} rule
 * @param {RegExp} pattern
 * @returns {Rule}
 */
export function addedLineRule(rule, pattern) {
  return (files) =>
    files
      .filter((file) => CODE_FILE.test(file.path))
      .flatMap((file) =>
        file.added.filter(({ text }) => pattern.test(text)).map(({ line }) => ({ rule, file: file.path, line })),
      );
}

/** Findings that fail the check. @type {Rule[]} */
export const failRules = [
  addedLineRule("ts-ignore", /@ts-ignore\b/),
  addedLineRule("ts-expect-error", /@ts-expect-error\b/),
  addedLineRule("eslint-disable", /\beslint-disable(?!-)\b/),
  addedLineRule("eslint-disable-next-line", /\beslint-disable-next-line\b/),
  addedLineRule("eslint-disable-line", /\beslint-disable-line\b/),
  addedLineRule("only", /\b(?:it|test|describe)(?:\.\w+)*\.only\b/),
  ...thresholdRules,
];

/** Findings that pass the check but make the PR one-way. @type {Rule[]} */
export const reportRules = [...removalRules];

/** @param {Finding} a @param {Finding} b */
function byPosition(a, b) {
  return a.file === b.file ? (a.line ?? 0) - (b.line ?? 0) : a.file < b.file ? -1 : 1;
}

/**
 * Runs both rule lists over the files of a diff, leaving out the gate's own files.
 * @param {DiffFile[]} files
 * @param {Context} [ctx]
 * @returns {{ failures: Finding[], reports: Finding[] }}
 */
export function analyze(files, ctx = { readFile: () => null }) {
  const inspected = files.filter((file) => !isExempt(file.path));
  const run = (rules) => rules.flatMap((rule) => rule(inspected, ctx)).sort(byPosition);
  return { failures: run(failRules), reports: run(reportRules) };
}

/**
 * Analyses `git diff <base>...<head>` in the repository at `cwd`.
 * @param {string} base
 * @param {string} [head]
 * @param {{ cwd?: string }} [options]
 * @returns {{ failures: Finding[], reports: Finding[] }}
 */
export function analyzeRange(base, head = "HEAD", { cwd = process.cwd() } = {}) {
  const git = (...args) =>
    execFileSync("git", ["-c", "core.quotePath=false", ...args], {
      cwd,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  // --text: git otherwise prints only "Binary files differ" for a file that holds a NUL byte or that a
  // .gitattributes marks `-diff`, and whatever that file adds would pass unseen.
  // --no-textconv: a committed `diff=<driver>` attribute with a local textconv would otherwise rewrite the lines.
  const diff = git("diff", "--no-color", "--no-ext-diff", "--no-textconv", "--text", "--find-renames", `${base}...${head}`);
  // `base...head` compares head with the commit where it left base, so that commit is the base side of every file.
  const refs = { base: git("merge-base", base, head).trim(), head };
  const readFile = (ref, path) => {
    try {
      return git("show", `${refs[ref]}:${path}`);
    } catch {
      return null;
    }
  };
  return analyze(parseDiff(diff), { readFile });
}

/**
 * The findings of `git diff <base>...<head>` that make the PR one-way, for the door script.
 * @param {string} base
 * @param {string} [head]
 * @param {{ cwd?: string }} [options]
 * @returns {Finding[]}
 */
export function oneWayFindings(base, head, options) {
  return analyzeRange(base, head, options).reports;
}

/**
 * The rule of a finding, followed by the key and the values of a threshold finding.
 * @param {Finding} f
 */
function ruleLabel(f) {
  return f.key === undefined ? f.rule : `${f.rule} ${f.key}: ${f.old} -> ${f.new}`;
}

/**
 * The job summary, as Markdown.
 * @param {{ failures: Finding[], reports: Finding[] }} result
 */
export function formatSummary({ failures, reports }) {
  const table = (findings) =>
    ["| File | Line | Rule |", "|---|---|---|", ...findings.map((f) => `| \`${f.file}\` | ${f.line ?? "-"} | ${ruleLabel(f).replaceAll("|", "\\|")} |`)].join("\n");
  const sections = ["## Test integrity"];
  if (failures.length === 0 && reports.length === 0) sections.push("Passed: no findings.");
  if (failures.length > 0) sections.push(`**Failed:** ${failures.length} finding(s) that are never allowed in a diff.`, table(failures));
  if (reports.length > 0) sections.push("### Makes this PR one-way", `${reports.length} finding(s) that pass the check.`, table(reports));
  return sections.join("\n\n") + "\n";
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const [base, head] = args.filter((arg) => arg !== "--json");
  if (!base) {
    console.error("Usage: node scripts/test-integrity.mjs [--json] <base> [head]");
    return 2;
  }
  let result;
  try {
    result = analyzeRange(base, head);
  } catch (error) {
    console.error(`test-integrity: cannot read the diff: ${error.stderr || error.message}`);
    return 2;
  }
  const line = (f) => `${f.file}${f.line === null ? "" : `:${f.line}`} ${ruleLabel(f)}`;
  if (json) {
    console.log(JSON.stringify({ fail: result.failures, oneWay: result.reports }, null, 2));
  } else {
    for (const f of result.failures) console.log(`FAIL   ${line(f)}`);
    for (const f of result.reports) console.log(`REPORT ${line(f)}`);
    if (result.failures.length + result.reports.length === 0) console.log("test-integrity: no findings");
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, formatSummary(result));
  return result.failures.length > 0 ? 1 : 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
