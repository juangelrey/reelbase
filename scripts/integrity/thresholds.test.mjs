// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { analyze } from "../test-integrity.mjs";

const CLI = fileURLToPath(new URL("../test-integrity.mjs", import.meta.url));

/** The fail findings for a diff that changes `path` from the `base` source to the `head` source; null is a missing file. */
function failuresFor(path, base, head) {
  const status = base === null ? "added" : head === null ? "deleted" : "modified";
  const file = { path, oldPath: base === null ? null : path, status, added: [], removed: [] };
  const sources = { base, head };
  return analyze([file], { readFile: (ref, read) => (read === path ? sources[ref] : null) }).failures;
}

/** A Vitest config whose coverage thresholds are `thresholds`, one per line from line 6. */
function vitestConfig(thresholds) {
  return [
    'import { defineConfig } from "vitest/config";',
    "export default defineConfig({",
    "  test: {",
    "    coverage: {",
    "      thresholds: {",
    ...thresholds.map((line) => `        ${line}`),
    "      },",
    "    },",
    "  },",
    "});",
    "",
  ].join("\n");
}

/** A Playwright config whose top-level options are `options`, one per line from line 3. */
function playwrightConfig(options) {
  return [
    'import { defineConfig } from "@playwright/test";',
    "export default defineConfig({",
    ...options.map((line) => `  ${line}`),
    '  webServer: { command: "pnpm dev", timeout: 120_000 },',
    "});",
    "",
  ].join("\n");
}

describe("failRules: lowered coverage thresholds", () => {
  it.each(["lines", "functions", "branches", "statements"])("fails a lowered %s threshold with its key and both values", (metric) => {
    const base = vitestConfig(["lines: 80,", "functions: 80,", "branches: 80,", "statements: 80,"]);
    const head = base.replace(`${metric}: 80`, `${metric}: 70`);

    const failures = failuresFor("vitest.config.ts", base, head);

    expect(failures).toEqual([
      { rule: "lowered-threshold", file: "vitest.config.ts", line: expect.any(Number), key: `thresholds.${metric}`, old: 80, new: 70 },
    ]);
  });

  it("points at the line of the lowered threshold in the head file", () => {
    const base = vitestConfig(["lines: 80,", "branches: 80,"]);
    const head = vitestConfig(["lines: 80,", "branches: 75,"]);

    expect(failuresFor("vitest.config.ts", base, head)[0].line).toBe(7);
  });

  it("passes a raised threshold", () => {
    const base = vitestConfig(["lines: 80,"]);
    const head = vitestConfig(["lines: 90,"]);

    expect(failuresFor("vitest.config.ts", base, head)).toEqual([]);
  });

  it("passes unchanged thresholds when the rest of the file changes", () => {
    const base = vitestConfig(["lines: 80,", "branches: 70,"]);
    const head = base.replace("test: {", 'test: {\n    environment: "jsdom",');

    expect(failuresFor("vitest.config.ts", base, head)).toEqual([]);
  });

  it("counts a removed threshold as no threshold, which is zero", () => {
    const base = vitestConfig(["lines: 80,", "branches: 70,"]);
    const head = vitestConfig(["branches: 70,"]);

    expect(failuresFor("vitest.config.ts", base, head)).toEqual([
      { rule: "lowered-threshold", file: "vitest.config.ts", line: null, key: "thresholds.lines", old: 80, new: 0 },
    ]);
  });

  it("counts a threshold that is commented out as removed", () => {
    const base = vitestConfig(["lines: 80,"]);
    const head = vitestConfig(["// lines: 80,"]);

    expect(failuresFor("vitest.config.ts", base, head)).toMatchObject([{ key: "thresholds.lines", old: 80, new: 0 }]);
  });

  it("passes a newly added threshold", () => {
    const base = vitestConfig(["lines: 80,"]);
    const head = vitestConfig(["lines: 80,", "functions: 60,"]);

    expect(failuresFor("vitest.config.ts", base, head)).toEqual([]);
  });

  it("fails a lowered threshold of one glob when thresholds are set per glob", () => {
    const base = vitestConfig(["lines: 80,", '"src/lib/**": { lines: 90 },']);
    const head = vitestConfig(["lines: 80,", '"src/lib/**": { lines: 50 },']);

    expect(failuresFor("vitest.config.ts", base, head)).toMatchObject([{ key: "thresholds.lines", old: 80, new: 50 }]);
  });

  it("compares the lowest value of a conditional", () => {
    const base = vitestConfig(["lines: process.env.CI ? 80 : 50,"]);
    const head = vitestConfig(["lines: process.env.CI ? 80 : 40,"]);

    expect(failuresFor("vitest.config.ts", base, head)).toMatchObject([{ rule: "lowered-threshold", key: "thresholds.lines", old: 50, new: 40 }]);
  });

  it("fails a changed negative threshold as unreadable, naming both texts", () => {
    const base = vitestConfig(["lines: -10,"]);
    const head = vitestConfig(["lines: -50,"]);

    expect(failuresFor("vitest.config.ts", base, head)).toMatchObject([{ rule: "lowered-threshold", key: "thresholds.lines", old: "-10", new: "-50" }]);
  });

  it("leaves a metric alone outside thresholds", () => {
    const base = 'export default { report: { lines: 80 }, name: "a" };\n';
    const head = 'export default { report: { lines: 10 }, name: "a" };\n';

    expect(failuresFor("vitest.config.ts", base, head)).toEqual([]);
  });
});

describe("failRules: raised retries", () => {
  it("fails raised retries with the key and both values", () => {
    const base = playwrightConfig(["retries: 0,"]);
    const head = playwrightConfig(["retries: 2,"]);

    expect(failuresFor("playwright.config.ts", base, head)).toEqual([
      { rule: "raised-retries", file: "playwright.config.ts", line: 3, key: "retries", old: 0, new: 2 },
    ]);
  });

  it("passes lowered retries", () => {
    const base = playwrightConfig(["retries: 2,"]);
    const head = playwrightConfig(["retries: 1,"]);

    expect(failuresFor("playwright.config.ts", base, head)).toEqual([]);
  });

  it("passes unchanged retries", () => {
    const base = playwrightConfig(["retries: 1,", "workers: 2,"]);
    const head = playwrightConfig(["retries: 1,", "workers: 4,"]);

    expect(failuresFor("playwright.config.ts", base, head)).toEqual([]);
  });

  it("fails newly added retries, compared with the default of none", () => {
    const base = playwrightConfig(["workers: 2,"]);
    const head = playwrightConfig(["workers: 2,", "retries: 3,"]);

    expect(failuresFor("playwright.config.ts", base, head)).toMatchObject([{ rule: "raised-retries", old: 0, new: 3, line: 4 }]);
  });

  it("passes removed retries", () => {
    const base = playwrightConfig(["retries: 2,"]);
    const head = playwrightConfig([]);

    expect(failuresFor("playwright.config.ts", base, head)).toEqual([]);
  });

  it("fails retries raised for one project", () => {
    const base = playwrightConfig(['projects: [{ name: "desktop" }, { name: "phone", retries: 1 }],']);
    const head = playwrightConfig(['projects: [{ name: "desktop" }, { name: "phone", retries: 4 }],']);

    expect(failuresFor("playwright.config.ts", base, head)).toMatchObject([{ rule: "raised-retries", old: 1, new: 4 }]);
  });

  it("compares the highest value of a conditional", () => {
    const base = playwrightConfig(["retries: process.env.CI ? 2 : 0,"]);
    const head = playwrightConfig(["retries: process.env.CI ? 3 : 0,"]);

    expect(failuresFor("playwright.config.ts", base, head)).toMatchObject([{ rule: "raised-retries", old: 2, new: 3 }]);
  });

  it("fails a number replaced by something it cannot read, naming the new text", () => {
    const base = playwrightConfig(["retries: 1,"]);
    const head = playwrightConfig(["retries: RETRIES,"]);

    expect(failuresFor("playwright.config.ts", base, head)).toMatchObject([{ rule: "raised-retries", old: 1, new: "RETRIES" }]);
  });

  it("passes a value it cannot read that did not change", () => {
    const base = playwrightConfig(["retries: RETRIES,", "workers: 2,"]);
    const head = playwrightConfig(["retries: RETRIES,", "workers: 4,"]);

    expect(failuresFor("playwright.config.ts", base, head)).toEqual([]);
  });
});

describe("failRules: raised timeouts", () => {
  it("fails a raised timeout with the key and both values", () => {
    const base = playwrightConfig(["timeout: 30_000,"]);
    const head = playwrightConfig(["timeout: 60_000,"]);

    expect(failuresFor("playwright.config.ts", base, head)).toEqual([
      { rule: "raised-timeout", file: "playwright.config.ts", line: 3, key: "timeout", old: 30000, new: 60000 },
    ]);
  });

  it("fails a raised expect.timeout with the key and both values", () => {
    const base = playwrightConfig(["expect: { timeout: 5000 },"]);
    const head = playwrightConfig(["expect: { timeout: 10000 },"]);

    expect(failuresFor("playwright.config.ts", base, head)).toEqual([
      { rule: "raised-timeout", file: "playwright.config.ts", line: 3, key: "expect.timeout", old: 5000, new: 10000 },
    ]);
  });

  it("fails a raised timeout in vitest.config.ts", () => {
    const base = "export default { test: { timeout: 1000 } };\n";
    const head = "export default { test: { timeout: 2000 } };\n";

    expect(failuresFor("vitest.config.ts", base, head)).toMatchObject([{ rule: "raised-timeout", key: "timeout", old: 1000, new: 2000 }]);
  });

  it("passes a lowered timeout and a lowered expect.timeout", () => {
    const base = playwrightConfig(["timeout: 30_000,", "expect: { timeout: 5000 },"]);
    const head = playwrightConfig(["timeout: 10_000,", "expect: { timeout: 2000 },"]);

    expect(failuresFor("playwright.config.ts", base, head)).toEqual([]);
  });

  it("passes unchanged timeouts", () => {
    const base = playwrightConfig(["timeout: 30_000,", "expect: { timeout: 5000 },", "workers: 2,"]);
    const head = playwrightConfig(["timeout: 30_000,", "expect: { timeout: 5000 },", "workers: 4,"]);

    expect(failuresFor("playwright.config.ts", base, head)).toEqual([]);
  });

  it("multiplies out a timeout written as a product", () => {
    const base = playwrightConfig(["timeout: 30 * 1000,"]);
    const head = playwrightConfig(["timeout: 2 * 60 * 1000,"]);

    expect(failuresFor("playwright.config.ts", base, head)).toMatchObject([{ key: "timeout", old: 30000, new: 120000 }]);
  });

  it("reads a timeout of 0 as no timeout, the largest raise there is", () => {
    const base = playwrightConfig(["timeout: 30_000,"]);
    const head = playwrightConfig(["timeout: 0,"]);

    expect(failuresFor("playwright.config.ts", base, head)).toEqual([
      { rule: "raised-timeout", file: "playwright.config.ts", line: 3, key: "timeout", old: 30000, new: Infinity },
    ]);
  });

  it("reads an expect.timeout of 0 as no timeout", () => {
    const base = playwrightConfig(["expect: { timeout: 5000 },"]);
    const head = playwrightConfig(["expect: { timeout: 0 },"]);

    expect(failuresFor("playwright.config.ts", base, head)).toMatchObject([{ key: "expect.timeout", old: 5000, new: Infinity }]);
  });

  it("passes a timeout of 0 replaced by a real timeout", () => {
    const base = playwrightConfig(["timeout: 0,"]);
    const head = playwrightConfig(["timeout: 60_000,"]);

    expect(failuresFor("playwright.config.ts", base, head)).toEqual([]);
  });

  it("fails a number turned into a sum as unreadable, naming the new text", () => {
    const base = playwrightConfig(["timeout: 30000,"]);
    const head = playwrightConfig(["timeout: 30000 + 30000,"]);

    expect(failuresFor("playwright.config.ts", base, head)).toMatchObject([{ key: "timeout", old: 30000, new: "30000 + 30000" }]);
  });

  it("fails a number turned into a hexadecimal one as unreadable", () => {
    const base = playwrightConfig(["timeout: 30_000,"]);
    const head = playwrightConfig(["timeout: 0x1ffff,"]);

    expect(failuresFor("playwright.config.ts", base, head)).toMatchObject([{ key: "timeout", old: 30000, new: "0x1ffff" }]);
  });

  it("fails a changed number with an exponent as unreadable, naming both texts", () => {
    const base = playwrightConfig(["timeout: 3e4,"]);
    const head = playwrightConfig(["timeout: 6e4,"]);

    expect(failuresFor("playwright.config.ts", base, head)).toMatchObject([{ key: "timeout", old: "3e4", new: "6e4" }]);
  });

  it("fails a changed quotient as unreadable", () => {
    const base = playwrightConfig(["timeout: 60000 / 2,"]);
    const head = playwrightConfig(["timeout: 60000 / 1,"]);

    expect(failuresFor("playwright.config.ts", base, head)).toMatchObject([{ key: "timeout", old: "60000 / 2", new: "60000 / 1" }]);
  });

  it("fails a changed power as unreadable", () => {
    const base = playwrightConfig(["timeout: 2 ** 10,"]);
    const head = playwrightConfig(["timeout: 2 ** 20,"]);

    expect(failuresFor("playwright.config.ts", base, head)).toMatchObject([{ key: "timeout", old: "2 ** 10", new: "2 ** 20" }]);
  });

  it("counts a removed timeout below the default as raised to the default", () => {
    const base = playwrightConfig(["timeout: 10_000,", "expect: { timeout: 1000 },"]);
    const head = playwrightConfig([]);

    expect(failuresFor("playwright.config.ts", base, head)).toEqual([
      { rule: "raised-timeout", file: "playwright.config.ts", line: null, key: "timeout", old: 10000, new: 30000 },
      { rule: "raised-timeout", file: "playwright.config.ts", line: null, key: "expect.timeout", old: 1000, new: 5000 },
    ]);
  });

  it("passes a removed timeout above the default", () => {
    const base = playwrightConfig(["timeout: 60_000,", "expect: { timeout: 8000 },"]);
    const head = playwrightConfig([]);

    expect(failuresFor("playwright.config.ts", base, head)).toEqual([]);
  });

  it("fails a newly added timeout above the default", () => {
    const base = playwrightConfig([]);
    const head = playwrightConfig(["timeout: 45_000,"]);

    expect(failuresFor("playwright.config.ts", base, head)).toMatchObject([{ key: "timeout", old: 30000, new: 45000 }]);
  });

  it("leaves the web server's start-up timeout alone", () => {
    const base = playwrightConfig(["workers: 2,"]);
    const head = base.replace("timeout: 120_000", "timeout: 300_000");

    expect(failuresFor("playwright.config.ts", base, head)).toEqual([]);
  });

  it("is not misled by braces, colons and commas in strings, comments and regular expressions", () => {
    const base = playwrightConfig(['testMatch: /a{2},[}:]\\/\\//,', 'name: "a } , timeout: 1",', "/* timeout: 2, } */", "timeout: 30_000,"]);
    const head = base.replace("timeout: 30_000", "timeout: 40_000");

    expect(failuresFor("playwright.config.ts", base, head)).toMatchObject([{ key: "timeout", old: 30000, new: 40000, line: 6 }]);
  });
});

describe("failRules: config files that are skipped", () => {
  it("skips a config file that does not exist at base", () => {
    const head = playwrightConfig(["retries: 5,", "timeout: 90_000,"]);

    expect(failuresFor("playwright.config.ts", null, head)).toEqual([]);
  });

  it("skips a config file that does not exist at head", () => {
    const base = vitestConfig(["lines: 80,"]);

    expect(failuresFor("vitest.config.ts", base, null)).toEqual([]);
  });

  it("leaves other files alone", () => {
    const base = playwrightConfig(["retries: 0,"]);
    const head = playwrightConfig(["retries: 2,"]);

    expect(failuresFor("src/lib/playwright.config.ts", base, head)).toEqual([]);
  });
});

describe("CLI: lowered thresholds", () => {
  let repo;

  function git(...args) {
    return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], {
      cwd: repo,
      encoding: "utf8",
    }).trim();
  }

  function commit(files) {
    for (const [path, content] of Object.entries(files)) writeFileSync(join(repo, path), content);
    git("add", "-A");
    git("commit", "-q", "-m", "c");
    return git("rev-parse", "HEAD");
  }

  afterEach(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
    repo = undefined;
  });

  it("exits non-zero and prints the file, key and both values, on the console and in the job summary", () => {
    repo = mkdtempSync(join(tmpdir(), "test-integrity-thresholds-"));
    git("init", "-q");
    const base = commit({ "vitest.config.ts": vitestConfig(["lines: 80,"]), "playwright.config.ts": playwrightConfig(["retries: 0,"]) });
    const head = commit({ "vitest.config.ts": vitestConfig(["lines: 70,"]), "playwright.config.ts": playwrightConfig(["retries: 2,"]) });
    const summary = join(repo, "summary.md");

    const result = spawnSync("node", [CLI, base, head], { cwd: repo, encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: summary } });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("FAIL   vitest.config.ts:6 lowered-threshold thresholds.lines: 80 -> 70");
    expect(result.stdout).toContain("FAIL   playwright.config.ts:3 raised-retries retries: 0 -> 2");
    expect(readFileSync(summary, "utf8")).toContain("| `vitest.config.ts` | 6 | lowered-threshold thresholds.lines: 80 -> 70 |");
  });

  it("exits zero when a config file is new in the diff", () => {
    repo = mkdtempSync(join(tmpdir(), "test-integrity-thresholds-"));
    git("init", "-q");
    const base = commit({ "vitest.config.ts": vitestConfig(["lines: 80,"]) });
    const head = commit({ "playwright.config.ts": playwrightConfig(["retries: 2,"]) });

    const result = spawnSync("node", [CLI, base, head], { cwd: repo, encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } });

    expect(result.status).toBe(0);
  });
});
