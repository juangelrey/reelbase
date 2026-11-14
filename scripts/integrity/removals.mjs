// Report rules of the test-integrity gate: test removals and skips. They pass the check but make the PR one-way.
// This module imports nothing from ../test-integrity.mjs, which imports it.

/**
 * @typedef {import("../test-integrity.mjs").DiffFile} DiffFile
 * @typedef {import("../test-integrity.mjs").Finding} Finding
 * @typedef {import("../test-integrity.mjs").Rule} Rule
 */

const CODE_FILE = /\.[cm]?[jt]sx?$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

// `it`, `test` or `describe` with any modifiers before the one named, as in `test.describe.skip`.
const modifier = (name) => new RegExp(String.raw`\b(?:it|test|describe)(?:\.\w+)*\.${name}\b`);

/** Each way of writing a test that does not run, or that passes while failing. @type {[string, RegExp][]} */
const SKIP_FORMS = [
  ["skip", modifier("skip(?:If)?")],
  ["todo", modifier("todo")],
  ["fixme", modifier("fixme")],
  ["xit", /\bxit\b/],
  ["xdescribe", /\bxdescribe\b/],
  ["test-fail", modifier("fails?")],
];

/** An added skip form, on a line added to a JavaScript or TypeScript file. @type {Rule} */
function addedSkips(files) {
  return files
    .filter((file) => CODE_FILE.test(file.path))
    .flatMap((file) =>
      file.added.flatMap(({ line, text }) =>
        SKIP_FORMS.filter(([, pattern]) => pattern.test(text)).map(([rule]) => ({ rule, file: file.path, line })),
      ),
    );
}

/**
 * Whether the file that the test at `testPath` tests is deleted in this diff: `foo.test.ts(x)` pairs with
 * `foo.ts(x)` in the same directory. A `.spec.` file has no source pair.
 * @param {string} testPath
 * @param {DiffFile[]} files
 */
function sourceIsDeleted(testPath, files) {
  const match = /^(.*)\.test\.([cm]?[jt]s)x?$/.exec(testPath);
  if (!match) return false;
  const sources = [`${match[1]}.${match[2]}`, `${match[1]}.${match[2]}x`];
  return files.some((file) => file.status === "deleted" && sources.includes(file.path));
}

/** A test file that is deleted, or renamed to a name that is not a test's. @type {Rule} */
function deletedTestFiles(files) {
  return files
    .filter((file) => file.oldPath !== null && TEST_FILE.test(file.oldPath))
    .filter((file) => file.status === "deleted" || !TEST_FILE.test(file.path))
    .filter((file) => !sourceIsDeleted(file.oldPath, files))
    .map((file) => ({ rule: "deleted-test-file", file: file.oldPath, line: null }));
}

// A case is an `it` or `test` call with any case modifiers: `it.each(table)(...)` is one case, `describe` is none.
// Neither is a call that only starts with `test.`, such as `test.describe`, `test.step` or `test.beforeEach`, nor
// a method named `test`, as in `regex.test(s)`.
// A skipped case still counts, `xit` included, so a skip is reported as a skip only.
const CASE_MODIFIER = "each|for|only|skip|skipIf|runIf|concurrent|sequential|fails|fail|fixme|todo";
const CASE = new RegExp(String.raw`(?<![.\w$])x?(?:it|test)(?:\.(?:${CASE_MODIFIER})\b)*\s*[(\`]`, "g");

/** Counts the cases that start on these lines, leaving out commented lines. @param {{ text: string }[]} lines */
function countCases(lines) {
  return lines
    .filter(({ text }) => !/^\s*(?:\/\/|\/\*|\*)/.test(text))
    .reduce((count, { text }) => count + (text.match(CASE)?.length ?? 0), 0);
}

/**
 * A test file with fewer cases than at base. Cases are counted line by line, so the cases on the removed lines
 * minus those on the added lines is the whole file's decrease.
 * @type {Rule}
 */
function fewerCases(files) {
  return files
    .filter((file) => file.status !== "deleted" && file.oldPath !== null)
    .filter((file) => TEST_FILE.test(file.path) && TEST_FILE.test(file.oldPath))
    .filter((file) => countCases(file.removed) > countCases(file.added))
    .filter((file) => !sourceIsDeleted(file.oldPath, files))
    .map((file) => ({ rule: "fewer-test-cases", file: file.path, line: null }));
}

/** @type {Rule[]} */
export const removalRules = [addedSkips, deletedTestFiles, fewerCases];
