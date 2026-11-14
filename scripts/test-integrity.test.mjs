// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { analyze, analyzeRange, failRules, isExempt, parseDiff, reportRules } from "./test-integrity.mjs";

const CLI = fileURLToPath(new URL("./test-integrity.mjs", import.meta.url));

/** A one-hunk diff of `path` whose new side starts at line 10. Each body line carries its own +, - or space marker. */
function diffOf(path, body) {
  const oldCount = body.filter((l) => l[0] !== "+").length;
  const newCount = body.filter((l) => l[0] !== "-").length;
  return [
    `diff --git a/${path} b/${path}`,
    "index 1111111..2222222 100644",
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -10,${oldCount} +10,${newCount} @@ export function thing() {`,
    ...body,
    "",
  ].join("\n");
}

function failuresOf(diff) {
  return analyze(parseDiff(diff)).failures;
}

describe("parseDiff", () => {
  it("numbers added lines by their position in the new file", () => {
    const diff = diffOf("src/a.ts", [" const a = 1;", "-const b = 2;", "+const b = 3;", "+const c = 4;", " return a;"]);

    const [file] = parseDiff(diff);

    expect(file.added).toEqual([
      { line: 11, text: "const b = 3;" },
      { line: 12, text: "const c = 4;" },
    ]);
  });

  it("numbers removed lines by their position in the old file", () => {
    const diff = diffOf("src/a.ts", [" const a = 1;", "+const z = 0;", "-const b = 2;", " return a;"]);

    const [file] = parseDiff(diff);

    expect(file.removed).toEqual([{ line: 11, text: "const b = 2;" }]);
  });

  it("keeps counting across several hunks of one file", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,2 +1,3 @@",
      " one",
      "+two",
      " three",
      "@@ -40 +41,2 @@",
      " forty",
      "+forty-one",
      "",
    ].join("\n");

    const [file] = parseDiff(diff);

    expect(file.added).toEqual([
      { line: 2, text: "two" },
      { line: 42, text: "forty-one" },
    ]);
  });

  it("reports a modified file with its path on both sides", () => {
    const [file] = parseDiff(diffOf("src/a.ts", ["+x"]));

    expect(file).toMatchObject({ path: "src/a.ts", oldPath: "src/a.ts", status: "modified" });
  });

  it("reports an added file with no old path", () => {
    const diff = [
      "diff --git a/src/new.ts b/src/new.ts",
      "new file mode 100644",
      "index 0000000..2222222",
      "--- /dev/null",
      "+++ b/src/new.ts",
      "@@ -0,0 +1,2 @@",
      "+first",
      "+second",
      "",
    ].join("\n");

    const [file] = parseDiff(diff);

    expect(file).toMatchObject({ path: "src/new.ts", oldPath: null, status: "added" });
    expect(file.added).toEqual([
      { line: 1, text: "first" },
      { line: 2, text: "second" },
    ]);
  });

  it("reports a deleted file with its removed lines", () => {
    const diff = [
      "diff --git a/src/gone.test.ts b/src/gone.test.ts",
      "deleted file mode 100644",
      "index 1111111..0000000",
      "--- a/src/gone.test.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-first",
      "-second",
      "",
    ].join("\n");

    const [file] = parseDiff(diff);

    expect(file).toMatchObject({ path: "src/gone.test.ts", oldPath: "src/gone.test.ts", status: "deleted" });
    expect(file.removed).toEqual([
      { line: 1, text: "first" },
      { line: 2, text: "second" },
    ]);
  });

  it("reports a rename with both paths, even without content changes", () => {
    const diff = [
      "diff --git a/src/old name.ts b/src/new name.ts",
      "similarity index 100%",
      "rename from src/old name.ts",
      "rename to src/new name.ts",
      "",
    ].join("\n");

    const [file] = parseDiff(diff);

    expect(file).toMatchObject({ path: "src/new name.ts", oldPath: "src/old name.ts", status: "renamed" });
  });

  it("unquotes a path git quoted because it holds a quote, backslash or control character", () => {
    const diff = [
      String.raw`diff --git "a/src/we\"ird.ts" "b/src/we\"ird.ts"`,
      "new file mode 100644",
      "--- /dev/null",
      String.raw`+++ "b/src/we\"ird.ts"`,
      "@@ -0,0 +1 @@",
      "+first",
      "",
    ].join("\n");

    const [file] = parseDiff(diff);

    expect(file).toMatchObject({ path: 'src/we"ird.ts', status: "added" });
    expect(file.added).toEqual([{ line: 1, text: "first" }]);
  });

  it("unquotes the quoted side of a rename", () => {
    const diff = [
      String.raw`diff --git a/src/old b/name.ts "b/src/back\\slash\ttab\001.ts"`,
      "similarity index 100%",
      "rename from src/old b/name.ts",
      String.raw`rename to "src/back\\slash\ttab\001.ts"`,
      "",
    ].join("\n");

    const [file] = parseDiff(diff);

    expect(file).toMatchObject({ path: "src/back\\slash\ttab\x01.ts", oldPath: "src/old b/name.ts", status: "renamed" });
  });

  it("throws on a file header it cannot read, rather than skipping the file", () => {
    const diff = ["diff --git src/a.ts src/a.ts", "--- src/a.ts", "+++ src/a.ts", "@@ -0,0 +1 @@", "+// @ts-ignore", ""].join("\n");

    expect(() => parseDiff(diff)).toThrow("src/a.ts");
  });

  it("separates the files of a multi-file diff", () => {
    const diff = diffOf("src/a.ts", ["+a"]) + diffOf("src/b.ts", ["+b"]);

    const files = parseDiff(diff);

    expect(files.map((f) => f.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(files[1].added).toEqual([{ line: 10, text: "b" }]);
  });

  it("treats an added line that looks like a file header as content", () => {
    const diff = diffOf("src/a.ts", ["+++ b/src/fake.ts", "+real"]);

    const files = parseDiff(diff);

    expect(files).toHaveLength(1);
    expect(files[0].added).toEqual([
      { line: 10, text: "++ b/src/fake.ts" },
      { line: 11, text: "real" },
    ]);
  });

  it("ignores the no-newline marker", () => {
    const diff = diffOf("src/a.ts", ["-old", "+new"]) + "\\ No newline at end of file\n";

    const [file] = parseDiff(diff);

    expect(file.added).toEqual([{ line: 10, text: "new" }]);
  });
});

describe("failRules: suppressions on added lines", () => {
  it("fails an added @ts-ignore with its file and line", () => {
    const diff = diffOf("src/a.ts", [" const a = 1;", "+// @ts-ignore", "+const b: number = 'x';"]);

    expect(failuresOf(diff)).toEqual([{ rule: "ts-ignore", file: "src/a.ts", line: 11 }]);
  });

  it("fails an added @ts-expect-error with its file and line", () => {
    const diff = diffOf("src/a.tsx", ["+  // @ts-expect-error wrong on purpose", " call();"]);

    expect(failuresOf(diff)).toEqual([{ rule: "ts-expect-error", file: "src/a.tsx", line: 10 }]);
  });

  it("fails an added eslint-disable block comment", () => {
    const diff = diffOf("src/a.ts", ["+/* eslint-disable no-console */", " console.log(1);"]);

    expect(failuresOf(diff)).toEqual([{ rule: "eslint-disable", file: "src/a.ts", line: 10 }]);
  });

  it("fails an added eslint-disable-next-line", () => {
    const diff = diffOf("src/a.ts", [" one();", " two();", "+// eslint-disable-next-line no-console"]);

    expect(failuresOf(diff)).toEqual([{ rule: "eslint-disable-next-line", file: "src/a.ts", line: 12 }]);
  });

  it("fails an added eslint-disable-line", () => {
    const diff = diffOf("src/a.ts", ["-console.log(1);", "+console.log(1); // eslint-disable-line no-console"]);

    expect(failuresOf(diff)).toEqual([{ rule: "eslint-disable-line", file: "src/a.ts", line: 10 }]);
  });

  it("does not fail an added eslint-enable", () => {
    const diff = diffOf("src/a.ts", ["+/* eslint-enable no-console */"]);

    expect(failuresOf(diff)).toEqual([]);
  });

  it("reports every suppression on one added line", () => {
    const diff = diffOf("src/a.ts", ["+// @ts-ignore eslint-disable-line"]);

    expect(failuresOf(diff)).toEqual([
      { rule: "ts-ignore", file: "src/a.ts", line: 10 },
      { rule: "eslint-disable-line", file: "src/a.ts", line: 10 },
    ]);
  });
});

describe("failRules: .only on added lines", () => {
  it("fails an added it.only with its file and line", () => {
    const diff = diffOf("src/a.test.ts", [" describe('a', () => {", "+  it.only('runs alone', () => {});"]);

    expect(failuresOf(diff)).toEqual([{ rule: "only", file: "src/a.test.ts", line: 11 }]);
  });

  it("fails an added test.only", () => {
    const diff = diffOf("e2e/home.spec.ts", ["+test.only('home', async () => {});"]);

    expect(failuresOf(diff)).toEqual([{ rule: "only", file: "e2e/home.spec.ts", line: 10 }]);
  });

  it("fails an added describe.only", () => {
    const diff = diffOf("src/a.test.tsx", ["+describe.only('a', () => {"]);

    expect(failuresOf(diff)).toEqual([{ rule: "only", file: "src/a.test.tsx", line: 10 }]);
  });

  it("fails .only behind a modifier, as in test.describe.only or it.concurrent.only", () => {
    const diff = diffOf("e2e/home.spec.ts", ["+test.describe.only('home', () => {", "+it.concurrent.only('x', () => {});"]);

    expect(failuresOf(diff).map((f) => f.line)).toEqual([10, 11]);
  });

  it("does not fail .only on something that is not it, test or describe", () => {
    const diff = diffOf("src/a.ts", ["+const x = submit.only(1);", "+const y = commit.only;"]);

    expect(failuresOf(diff)).toEqual([]);
  });
});

describe("failRules: lines the diff did not add", () => {
  const forms = [
    "// @ts-ignore",
    "// @ts-expect-error",
    "/* eslint-disable */",
    "// eslint-disable-next-line no-console",
    "run(); // eslint-disable-line",
    "it.only('a', () => {});",
    "test.only('a', () => {});",
    "describe.only('a', () => {});",
  ];

  it.each(forms)("does not fail %s on an unchanged line, already present at base", (form) => {
    const diff = diffOf("src/a.test.ts", [` ${form}`, "+const added = 1;"]);

    expect(failuresOf(diff)).toEqual([]);
  });

  it.each(forms)("does not fail %s on a removed line", (form) => {
    const diff = diffOf("src/a.test.ts", [`-${form}`, " const kept = 1;"]);

    expect(failuresOf(diff)).toEqual([]);
  });

  it("does not fail a deleted file full of suppressions", () => {
    const diff = [
      "diff --git a/src/gone.ts b/src/gone.ts",
      "deleted file mode 100644",
      "--- a/src/gone.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-// @ts-ignore",
      "-it.only('a', () => {});",
      "",
    ].join("\n");

    expect(failuresOf(diff)).toEqual([]);
  });
});

describe("files left out of inspection", () => {
  it.each([
    "scripts/test-integrity.mjs",
    "scripts/test-integrity.test.mjs",
    "scripts/integrity/rules.mjs",
    "scripts/integrity/fixtures/a.test.ts",
  ])("exempts the gate's own file %s", (path) => {
    expect(isExempt(path)).toBe(true);
    expect(failuresOf(diffOf(path, ["+// @ts-ignore", "+it.only('a', () => {});"]))).toEqual([]);
  });

  it.each(["scripts/door.mjs", "src/scripts/test-integrity.mjs", "scripts/integrity.mjs"])(
    "still inspects %s",
    (path) => {
      expect(isExempt(path)).toBe(false);
      expect(failuresOf(diffOf(path, ["+// @ts-ignore"]))).toHaveLength(1);
    },
  );

  it.each(["docs/software-factory-plan.md", ".github/workflows/ci.yml", "README.md"])(
    "does not look for directives in %s, which is not JavaScript or TypeScript",
    (path) => {
      expect(failuresOf(diffOf(path, ["+Never add @ts-ignore, eslint-disable or it.only"]))).toEqual([]);
    },
  );

  it.each(["a.js", "a.jsx", "a.ts", "a.tsx", "a.mjs", "a.cjs", "a.mts", "a.cts"])("inspects %s", (path) => {
    expect(failuresOf(diffOf(path, ["+// @ts-ignore"]))).toHaveLength(1);
  });
});

describe("analyze", () => {
  it("keeps fail findings and report findings apart", () => {
    const result = analyze(parseDiff(diffOf("src/a.ts", ["+// @ts-ignore"])));

    expect(result.failures).toHaveLength(1);
    expect(result.reports).toEqual([]);
  });

  it("has rules in both lists", () => {
    expect(reportRules.length).toBeGreaterThan(0);
    expect(failRules.length).toBeGreaterThan(0);
  });
});

describe("CLI", () => {
  let repo;

  function git(...args) {
    return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], {
      cwd: repo,
      encoding: "utf8",
    }).trim();
  }

  function commit(files) {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(join(repo, path), content);
    }
    git("add", "-A");
    git("commit", "-q", "-m", "c");
    return git("rev-parse", "HEAD");
  }

  function startRepo() {
    repo = mkdtempSync(join(tmpdir(), "test-integrity-"));
    git("init", "-q");
    return commit({
      "src/a.ts": "export const a = 1;\n// @ts-ignore\nexport const b: number = 2;\n",
      "src/a.test.ts": "it('a', () => {});\n",
    });
  }

  function runCli(args, env = {}) {
    return spawnSync("node", [CLI, ...args], { cwd: repo, encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "", ...env } });
  }

  afterEach(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
    repo = undefined;
  });

  it("exits non-zero and names the finding when head adds a .only", () => {
    const base = startRepo();
    const head = commit({ "src/a.test.ts": "it('a', () => {});\nit.only('b', () => {});\n" });

    const result = runCli([base, head]);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("src/a.test.ts:2 only");
  });

  it("exits zero when head touches a file whose suppression was already at base", () => {
    const base = startRepo();
    const head = commit({ "src/a.ts": "export const a = 5;\n// @ts-ignore\nexport const b: number = 2;\n" });

    const result = runCli([base, head]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no findings");
  });

  it("ignores what the base branch added after the branches split", () => {
    const fork = startRepo();
    const head = commit({ "src/c.ts": "export const c = 1;\n" });
    git("checkout", "-q", "-b", "trunk", fork);
    const base = commit({ "src/d.ts": "// @ts-ignore\nexport const d: number = 1;\n" });

    const result = runCli([base, head]);

    expect(result.status).toBe(0);
  });

  it("does not blame head for a suppression the base branch removed after the branches split", () => {
    const fork = startRepo();
    const head = commit({ "src/c.ts": "export const c = 1;\n" });
    git("checkout", "-q", "-b", "trunk", fork);
    const base = commit({ "src/a.ts": "export const a = 1;\nexport const b: number = 2;\n" });

    const result = runCli([base, head]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no findings");
  });

  it("compares a threshold with the config where the branches split, not with a later raise on the base branch", () => {
    const config = (lines, reporter) => `export default { test: { coverage: { reporter: ["${reporter}"], thresholds: { lines: ${lines} } } } };\n`;
    startRepo();
    const fork = commit({ "vitest.config.ts": config(80, "text") });
    const head = commit({ "vitest.config.ts": config(80, "html") });
    git("checkout", "-q", "-b", "trunk", fork);
    const base = commit({ "vitest.config.ts": config(90, "text") });

    const result = analyzeRange(base, head, { cwd: repo });

    expect(result.failures).toEqual([]);
  });

  it.each([
    ["a double quote", 'src/we"ird.ts'],
    ["a backslash", "src/back\\slash.ts"],
    ["a tab", "src/tab\tbed.ts"],
    ["a newline", "src/new\nline.ts"],
  ])("fails a suppression in a new file whose name holds %s", (_, path) => {
    const base = startRepo();
    const head = commit({ [path]: "// @ts-ignore\nexport const w: number = 1;\n" });

    const result = runCli([base, head]);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`${path}:1 ts-ignore`);
  });

  it("writes every finding with file, line and rule to the job summary", () => {
    const base = startRepo();
    const head = commit({
      "src/a.test.ts": "it('a', () => {});\nit.only('b', () => {});\n",
      "src/new.ts": "/* eslint-disable */\nexport const n = 1;\n",
    });
    const summary = join(repo, "summary.md");
    writeFileSync(summary, "earlier step\n");

    const result = runCli([base, head], { GITHUB_STEP_SUMMARY: summary });

    const written = readFileSync(summary, "utf8");
    expect(result.status).toBe(1);
    expect(written).toContain("earlier step");
    expect(written).toContain("| `src/a.test.ts` | 2 | only |");
    expect(written).toContain("| `src/new.ts` | 1 | eslint-disable |");
  });

  it("writes a passing summary when there are no findings", () => {
    const base = startRepo();
    const head = commit({ "src/c.ts": "export const c = 1;\n" });
    const summary = join(repo, "summary.md");

    const result = runCli([base, head], { GITHUB_STEP_SUMMARY: summary });

    expect(result.status).toBe(0);
    expect(readFileSync(summary, "utf8")).toContain("no findings");
  });

  it("exits non-zero without a base", () => {
    startRepo();

    const result = runCli([]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage");
  });

  it("exits non-zero when a commit cannot be read, rather than passing", () => {
    startRepo();

    const result = runCli(["0000000000000000000000000000000000000000", "HEAD"]);

    expect(result.status).not.toBe(0);
  });
});
