// Fail rule of the test-integrity gate: a test config that asks for less at head than at base.
// This module imports nothing from ../test-integrity.mjs, which imports it.
//
// The configs are TypeScript and the gate has no dependencies, so values are read from the source text:
// `key: value` pairs inside object literals, wherever they sit in the file.

/**
 * @typedef {import("../test-integrity.mjs").Finding} Finding
 * @typedef {import("../test-integrity.mjs").Rule} Rule
 * @typedef {{ key: string, text: string, line: number }} Entry  one `key: value` pair: its tracked key, value text and line
 */

const CONFIG_FILES = ["vitest.config.ts", "playwright.config.ts"];
const METRICS = ["lines", "functions", "branches", "statements"];

/**
 * The keys compared, in the order findings are listed. `weaker` is the direction that weakens the tests: -1 when
 * a lower value does, 1 when a higher one does. `fallback` is the tool's default, which stands in for a key that
 * is absent: no coverage threshold, and Playwright's no retries, 30 s per test and 5 s per expect. `zeroIsOff`
 * marks a key whose 0 switches the limit off, so it is read as Infinity.
 */
const KEYS = [
  ...METRICS.map((metric) => ({ key: `thresholds.${metric}`, rule: "lowered-threshold", weaker: -1, fallback: 0 })),
  { key: "retries", rule: "raised-retries", weaker: 1, fallback: 0 },
  { key: "timeout", rule: "raised-timeout", weaker: 1, fallback: 30_000, zeroIsOff: true },
  { key: "expect.timeout", rule: "raised-timeout", weaker: 1, fallback: 5_000, zeroIsOff: true },
];

/**
 * The tracked key that a property at `path` sets, or null. A metric counts anywhere under `thresholds`, so
 * per-glob thresholds are included; `webServer.timeout` is how long the server may take to start, not a test's.
 * @param {string[]} path  the property's name, preceded by the names of the properties it is nested in
 */
function trackedKey(path) {
  const name = path.at(-1);
  const parents = path.slice(0, -1);
  if (METRICS.includes(name) && parents.includes("thresholds")) return `thresholds.${name}`;
  if (name === "retries") return "retries";
  if (name === "timeout" && !parents.includes("webServer")) return parents.at(-1) === "expect" ? "expect.timeout" : "timeout";
  return null;
}

/**
 * The source with comments blanked and, inside strings and regular expressions, every character that is not a
 * word character replaced by `_`, so what is left of the structure is code. Offsets and line breaks are kept.
 * @param {string} source
 */
function mask(source) {
  let out = "";
  let prev = ""; // the last character of code that is not white space
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const two = source.slice(i, i + 2);
    if (two === "//" || two === "/*") {
      const close = two === "//" ? source.indexOf("\n", i) : source.indexOf("*/", i + 2);
      const end = close === -1 ? source.length : two === "//" ? close : close + 2;
      out += source.slice(i, end).replace(/[^\n]/g, " ");
      i = end;
    } else if (c === '"' || c === "'" || c === "`" || (c === "/" && (prev === "" || "(,=:[!&|?{};".includes(prev)))) {
      let end = i + 1;
      while (end < source.length && source[end] !== c) end += source[end] === "\\" ? 2 : 1;
      out += c + source.slice(i + 1, end).replace(/[^\w\n]/g, "_") + c;
      i = end + 1;
      prev = c;
    } else {
      out += c;
      if (/\S/.test(c)) prev = c;
      i++;
    }
  }
  return out.slice(0, source.length);
}

const PROPERTY = /(?:([\w$]+)|["'](\w*)["'])\s*:/y;
const OPENER = { "}": "{", "]": "[", ")": "(" };

/**
 * Every property in the source that sets a tracked key.
 * @param {string} source
 * @returns {Entry[]}
 */
function readEntries(source) {
  const text = mask(source);
  const entries = [];
  // The brackets and property values the scan is inside. A property value runs to the `,` or `;` that follows it
  // or to the `}` that closes its object.
  /** @type {{ open: string, name?: string, start?: number, line?: number }[]} */
  const stack = [];
  let prev = "";

  const closeValue = (end) => {
    const path = stack.filter((frame) => frame.open === ":").map((frame) => frame.name);
    const { start, line } = stack.pop();
    const key = trackedKey(path);
    if (key) entries.push({ key, text: text.slice(start, end).trim().replace(/\s+/g, " "), line });
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (/\s/.test(c)) continue;
    const top = stack.at(-1);
    PROPERTY.lastIndex = i;
    const property = top?.open === "{" && (prev === "{" || prev === ",") ? PROPERTY.exec(text) : null;
    if (property) {
      i = PROPERTY.lastIndex - 1;
      stack.push({ open: ":", name: property[1] ?? property[2], start: i + 1, line: text.slice(0, i).split("\n").length });
      prev = ":";
      continue;
    }
    if (c === "{" || c === "[" || c === "(") {
      stack.push({ open: c });
    } else if (c in OPENER) {
      const at = stack.findLastIndex((frame) => frame.open === OPENER[c]);
      while (at !== -1 && stack.length > at) {
        if (stack.at(-1).open === ":") closeValue(i);
        else stack.pop();
      }
    } else if ((c === "," || c === ";") && top?.open === ":") {
      closeValue(i);
    }
    prev = c;
  }
  return entries;
}

const NUMBER = /\d[\d_]*(?:\.\d+)?/.source;
// A number, or a product of numbers such as `30 * 1000`, that is not part of a name.
const TERM = new RegExp(String.raw`(?<![\w$.])${NUMBER}(?:\s*\*\s*${NUMBER})*`, "g");
// Arithmetic the reader does not model: `+`, `-`, `/` and `**`, and a number that runs into a letter, as the
// exponent of `3e4` and the prefix of `0x1f` do.
const UNMODELLED = new RegExp(String.raw`[+\-/]|\*\*|(?<![\w$.])${NUMBER}[a-zA-Z]`);

/**
 * The number a value stands for, taking the weakest when it holds several, as in `process.env.CI ? 2 : 0`.
 * NaN when it holds none, or holds a number form the reader does not model.
 * @param {string} text
 * @param {{ weaker: number, zeroIsOff?: boolean }} spec
 */
function numberOf(text, { weaker, zeroIsOff }) {
  if (UNMODELLED.test(text)) return NaN;
  const terms = (text.match(TERM) ?? [])
    .map((term) => term.split("*").reduce((product, n) => product * Number(n.replaceAll("_", "")), 1))
    .map((term) => (zeroIsOff && term === 0 ? Infinity : term));
  if (terms.length === 0) return NaN;
  return weaker > 0 ? Math.max(...terms) : Math.min(...terms);
}

/**
 * What one side of the diff sets a key to: the weakest of its entries, or the default when it has none.
 * `value` is NaN when an entry cannot be read as a number.
 * @param {Entry[]} entries
 * @param {{ weaker: number, fallback: number, zeroIsOff?: boolean }} spec
 * @returns {{ value: number, text: string, line: number | null }}
 */
function sideOf(entries, spec) {
  const { weaker, fallback } = spec;
  if (entries.length === 0) return { value: fallback, text: String(fallback), line: null };
  const values = entries.map((entry) => numberOf(entry.text, spec));
  const unread = values.findIndex(Number.isNaN);
  const value = unread !== -1 ? NaN : weaker > 0 ? Math.max(...values) : Math.min(...values);
  const text = entries.map((entry) => entry.text).join(", ");
  return { value, text, line: entries[unread !== -1 ? unread : values.indexOf(value)].line };
}

/**
 * A lowered coverage threshold, raised `retries`, or raised `timeout` or `expect.timeout` in a test config.
 * A value that cannot be read as a number fails when its text changes: the gate cannot tell that it is not weaker.
 * A config file missing at base or at head is skipped.
 * @type {Rule}
 */
function weakenedConfig(files, ctx) {
  return files
    .filter((file) => CONFIG_FILES.includes(file.path))
    .flatMap((file) => {
      const base = ctx.readFile("base", file.path);
      const head = ctx.readFile("head", file.path);
      if (base === null || head === null) return [];
      const baseEntries = readEntries(base);
      const headEntries = readEntries(head);
      return KEYS.flatMap((spec) => {
        const before = sideOf(baseEntries.filter((entry) => entry.key === spec.key), spec);
        const after = sideOf(headEntries.filter((entry) => entry.key === spec.key), spec);
        const readable = !Number.isNaN(before.value) && !Number.isNaN(after.value);
        const weakened = readable ? (after.value - before.value) * spec.weaker > 0 : before.text !== after.text;
        if (!weakened) return [];
        const shown = (side) => (Number.isNaN(side.value) ? side.text : side.value);
        return [{ rule: spec.rule, file: file.path, line: after.line, key: spec.key, old: shown(before), new: shown(after) }];
      });
    });
}

/** @type {Rule[]} */
export const thresholdRules = [weakenedConfig];
