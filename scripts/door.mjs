#!/usr/bin/env node
// Door check: classifies every file a diff changes as a one-way or two-way door, by path alone,
// and calls the whole diff one-way too when the test-integrity gate reports a removed or skipped test.
//
//   node scripts/door.mjs --base <ref> [--head <ref>] [--json]     (head defaults to HEAD)
//
// The rules encode the door definitions under "PR body" in .claude/skills/as-build/SKILL.md.
// The script is a floor: one-way is final, two-way still needs the diff itself re-judged,
// because a path cannot show a persisted-data or key-format change inside an ordinary file.
// Exits 0 whatever the verdict, 2 when the arguments or the git range cannot be read.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { oneWayFindings } from "./test-integrity.mjs";

/**
 * @typedef {"one-way" | "two-way"} Door
 * @typedef {{
 *   status: "added" | "modified" | "deleted" | "renamed" | "other",
 *   path: string,            // path at head; for a deleted file, its path at base
 *   oldPath: string | null,  // path at base; null for an added file
 * }} Change
 * @typedef {{ file: string, class: Door, reason: string }} FileDoor  file is the Change's path
 * @typedef {import("./test-integrity.mjs").Finding} Finding
 * @typedef {{ file: string, line: number | null, rule: string, reason: string }} IntegrityDoor  line is null for a whole-file finding
 * @typedef {{ verdict: Door, files: FileDoor[], integrity: IntegrityDoor[] }} DoorResult
 */

const STATUS = { A: "added", M: "modified", D: "deleted", R: "renamed" };

/**
 * Parses `git diff --name-status -M -z` output.
 * @param {string} text
 * @returns {Change[]}
 */
export function parseNameStatus(text) {
  const fields = text.split("\0");
  const changes = [];
  for (let i = 0; i < fields.length && fields[i] !== ""; ) {
    const letter = fields[i++][0];
    const status = STATUS[letter] ?? "other";
    if (letter === "R" || letter === "C") {
      const oldPath = fields[i++];
      const path = fields[i++];
      // A copy leaves its source in place, so it is only a new file.
      changes.push(letter === "R" ? { status, path, oldPath } : { status: "added", path, oldPath: null });
    } else {
      const path = fields[i++];
      changes.push({ status, path, oldPath: status === "added" ? null : path });
    }
  }
  return changes;
}

// File-name rules match in any directory: a nested package.json or AGENTS.md is no safer than the root one.
// One-way patterns ignore case, so a differently-cased name cannot slip past them.
/** Checked first, whatever the change does to the file. @type {{ pattern: RegExp, reason: string }[]} */
const ONE_WAY = [
  { pattern: /(^|\/)(package\.json|pnpm-lock\.yaml|\.nvmrc)$/i, reason: "dependencies" },
  { pattern: /^\.github\//i, reason: "CI" },
  {
    pattern: /(^|\/)(next\.config\.[^/]+|vercel\.json|tsconfig\.json|(eslint|postcss|vitest|playwright)\.config\.[^/]+|vitest\.setup\.[^/]+)$/i,
    reason: "framework or deploy config",
  },
  { pattern: /(^|\/)\.env[^/]*$/i, reason: "environment variables" },
  { pattern: /(^|\/)sentry\.[^/]+\.config\.[^/]+$|^src\/instrumentation[^/]*\.ts$/i, reason: "observability config" },
  { pattern: /^src\/lib\/flags\//i, reason: "feature flags" },
  { pattern: /^src\/lib\/watchlist\//i, reason: "persisted data" },
  { pattern: /^scripts\//i, reason: "scripts that CI and the merge gate run" },
  { pattern: /^\.claude\/|(^|\/)(CLAUDE|AGENTS)\.md$/i, reason: "agent instructions" },
];

const PAGE_OR_ROUTE = /^src\/app\/(.+\/)?(page\.tsx|route\.ts)$/i;

/** Checked second. `keepsFile` rules cover additions and edits only. @type {{ pattern: RegExp, reason: string, keepsFile?: true }[]} */
const TWO_WAY = [
  { pattern: /^src\/components\//, reason: "UI component" },
  { pattern: /^src\/app\//, reason: "addition or edit under src/app/", keepsFile: true },
  { pattern: /^src\/lib\/(catalog|theme|tmdb)\//, reason: "catalog, theme or TMDB library code" },
  { pattern: /^e2e\//, reason: "addition or edit under e2e/", keepsFile: true },
  { pattern: /^docs\//, reason: "documentation" },
  { pattern: /\.md$/, reason: "Markdown outside .claude/" },
];

/**
 * Classifies one path. `removed` says the path no longer exists at head: it was deleted or renamed away.
 * @param {string} path
 * @param {boolean} removed
 * @returns {{ class: Door, reason: string }}
 */
function classifyPath(path, removed) {
  const oneWay = ONE_WAY.find((rule) => rule.pattern.test(path));
  if (oneWay) return { class: "one-way", reason: oneWay.reason };
  if (removed && PAGE_OR_ROUTE.test(path)) return { class: "one-way", reason: "removes or renames a public route" };

  const twoWay = TWO_WAY.find((rule) => rule.pattern.test(path));
  if (twoWay && !(removed && twoWay.keepsFile)) return { class: "two-way", reason: twoWay.reason };
  if (twoWay) return { class: "one-way", reason: `deleted or renamed; only an ${twoWay.reason} is two-way` };
  return { class: "one-way", reason: "matches no two-way rule" };
}

/**
 * Classifies one changed file: one-way rules first, then the two-way allowlist, then one-way by default.
 * A rename is judged as its old path removed plus its new path added.
 * @param {Change} change
 * @returns {FileDoor}
 */
export function classifyFile(change) {
  const file = change.path;
  if (change.status === "other") return { file, class: "one-way", reason: "unrecognised kind of change" };
  if (change.status !== "renamed") return { file, ...classifyPath(file, change.status === "deleted") };

  const from = classifyPath(change.oldPath, true);
  const to = classifyPath(file, false);
  const { class: door, reason } = from.class === "one-way" ? from : to;
  return { file, class: door, reason: `${reason} (renamed from ${change.oldPath})` };
}

/**
 * Classifies a whole diff: one-way if any file is, or if the test-integrity gate reported any one-way finding.
 * @param {Change[]} changes
 * @param {Finding[]} [findings]  the gate's one-way findings for the same diff
 * @returns {DoorResult}
 */
export function classify(changes, findings = []) {
  const files = changes.map(classifyFile);
  const integrity = findings.map(({ file, line, rule }) => ({ file, line, rule, reason: "test removed or skipped" }));
  const oneWay = integrity.length > 0 || files.some((f) => f.class === "one-way");
  return { verdict: oneWay ? "one-way" : "two-way", files, integrity };
}

/**
 * Classifies `git diff <base>...<head>` in the repository at `cwd`. Throws when the range cannot be read.
 * @param {string} base
 * @param {string} [head]
 * @param {{ cwd?: string }} [options]
 * @returns {DoorResult}
 */
export function classifyRange(base, head = "HEAD", { cwd = process.cwd() } = {}) {
  // Checked before any git call, here and in the integrity gate: git would read such a ref as an option.
  for (const ref of [base, head]) {
    if (ref.startsWith("-")) throw new Error(`a ref cannot start with "-": ${ref}`);
  }
  const text = execFileSync("git", ["diff", "--name-status", "-M", "-z", "--no-ext-diff", `${base}...${head}`, "--"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return classify(parseNameStatus(text), oneWayFindings(base, head, { cwd }));
}

/**
 * The per-file table and the verdict, as Markdown. Each integrity finding is a one-way row after the files,
 * naming its file, its line when it has one, and its rule.
 * @param {DoorResult} result
 */
export function formatMarkdown({ verdict, files, integrity }) {
  const cell = (text) => text.replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|");
  const row = (file, door, reason) => `| \`${cell(file).replace(/`/g, "'")}\` | ${door} | ${cell(reason)} |`;
  const table = [
    "| File | Class | Reason |",
    "|---|---|---|",
    ...files.map((f) => row(f.file, f.class, f.reason)),
    ...integrity.map((f) => row(f.line === null ? f.file : `${f.file}:${f.line}`, "one-way", `${f.reason} (${f.rule})`)),
  ].join("\n");
  const oneWay = files.filter((f) => f.class === "one-way").length;
  const findings = integrity.length === 0 ? "" : `, ${integrity.length} test-integrity finding(s)`;
  const count = files.length === 0 ? "" : ` (${oneWay} of ${files.length} file(s) one-way${findings})`;
  return ["## Door check", files.length === 0 ? "No changed files." : table, `**Door:** ${verdict}${count}`].join("\n\n") + "\n";
}

const USAGE = "Usage: node scripts/door.mjs --base <ref> [--head <ref>] [--json]";

function main(args) {
  let base;
  let head;
  let json = false;
  let unknown = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") json = true;
    else if (args[i] === "--base" && args[i + 1]) base = args[++i];
    else if (args[i] === "--head" && args[i + 1]) head = args[++i];
    else unknown = true;
  }
  if (!base || unknown) {
    console.error(USAGE);
    return 2;
  }
  let result;
  try {
    result = classifyRange(base, head);
  } catch (error) {
    console.error(`door: cannot read the diff: ${error.stderr || error.message}`);
    return 2;
  }
  process.stdout.write(json ? JSON.stringify(result, null, 2) + "\n" : formatMarkdown(result));
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
