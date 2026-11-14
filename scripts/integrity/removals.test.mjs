// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { analyze, oneWayFindings, parseDiff } from "../test-integrity.mjs";

const CLI = fileURLToPath(new URL("../test-integrity.mjs", import.meta.url));

/** A one-hunk diff of `path` whose new side starts at line 10. Each body line carries its own +, - or space marker. */
function diffOf(path, body) {
  const oldCount = body.filter((l) => l[0] !== "+").length;
  const newCount = body.filter((l) => l[0] !== "-").length;
  return [
    `diff --git a/${path} b/${path}`,
    "index 1111111..2222222 100644",
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -10,${oldCount} +10,${newCount} @@`,
    ...body,
    "",
  ].join("\n");
}

/** The diff of deleting `path`, whose content was `lines`. */
function deletionOf(path, lines = ["it('a', () => {});"]) {
  return [
    `diff --git a/${path} b/${path}`,
    "deleted file mode 100644",
    "index 1111111..0000000",
    `--- a/${path}`,
    "+++ /dev/null",
    `@@ -1,${lines.length} +0,0 @@`,
    ...lines.map((l) => `-${l}`),
    "",
  ].join("\n");
}

function renameOf(from, to) {
  return [`diff --git a/${from} b/${to}`, "similarity index 100%", `rename from ${from}`, `rename to ${to}`, ""].join("\n");
}

function reportsOf(diff) {
  return analyze(parseDiff(diff)).reports;
}

describe("reportRules: skips on added lines", () => {
  it.each([
    ["it.skip('a', () => {});", "skip"],
    ["test.skip('a', async () => {});", "skip"],
    ["describe.skip('a', () => {", "skip"],
    ["test.describe.skip('a', () => {", "skip"],
    ["it.skipIf(isCI)('a', () => {});", "skip"],
    ["it.todo('later');", "todo"],
    ["test.fixme('a', async () => {});", "fixme"],
    ["xit('a', () => {});", "xit"],
    ["xdescribe('a', () => {", "xdescribe"],
    ["test.fail('a', async () => {});", "test-fail"],
    ["it.fails('a', () => {});", "test-fail"],
  ])("reports an added %s as %s, with its file and line", (form, rule) => {
    const diff = diffOf("src/a.test.ts", [" describe('a', () => {", `+  ${form}`]);

    expect(reportsOf(diff)).toEqual([{ rule, file: "src/a.test.ts", line: 11 }]);
  });

  it("reports a skip added to an e2e spec", () => {
    const diff = diffOf("e2e/home.spec.ts", ["+  test.skip(isMobile, 'desktop only');"]);

    expect(reportsOf(diff)).toEqual([{ rule: "skip", file: "e2e/home.spec.ts", line: 10 }]);
  });

  it("does not fail the check for a skip", () => {
    const diff = diffOf("src/a.test.ts", ["+it.skip('a', () => {});"]);

    expect(analyze(parseDiff(diff)).failures).toEqual([]);
  });

  it.each(["it.skip('a', () => {});", "it.todo('later');", "test.fixme('a');", "xit('a');", "xdescribe('a');", "test.fail('a');"])(
    "does not report %s on an unchanged line, or as a skip on a removed line",
    (form) => {
      const diff = diffOf("src/a.test.ts", [` ${form}`, `-${form}`, `+it('replaces the removed case', () => {});`]);

      expect(reportsOf(diff)).toEqual([]);
    },
  );

  it("does not report look-alikes that are not test skips", () => {
    const diff = diffOf("src/a.ts", ["+stream.skip(1);", "+process.exit(1);", "+const todo = list.todo;", "+promise.fail();"]);

    expect(reportsOf(diff)).toEqual([]);
  });

  it("does not look for skips in a file that is not JavaScript or TypeScript", () => {
    const diff = diffOf("docs/testing.md", ["+Never commit it.skip or xit."]);

    expect(reportsOf(diff)).toEqual([]);
  });
});

describe("reportRules: deleted test files", () => {
  it("reports a deleted test file, with no line", () => {
    const diff = deletionOf("src/components/foo.test.tsx");

    expect(reportsOf(diff)).toEqual([{ rule: "deleted-test-file", file: "src/components/foo.test.tsx", line: null }]);
  });

  it("does not report foo.test.tsx deleted together with foo.tsx", () => {
    const diff = deletionOf("src/components/foo.test.tsx") + deletionOf("src/components/foo.tsx", ["export const Foo = 1;"]);

    expect(reportsOf(diff)).toEqual([]);
  });

  it("does not report foo.test.ts deleted together with foo.ts", () => {
    const diff = deletionOf("src/lib/foo.ts", ["export const foo = 1;"]) + deletionOf("src/lib/foo.test.ts");

    expect(reportsOf(diff)).toEqual([]);
  });

  it("pairs foo.test.tsx with foo.ts", () => {
    const diff = deletionOf("src/lib/foo.test.tsx") + deletionOf("src/lib/foo.ts", ["export const foo = 1;"]);

    expect(reportsOf(diff)).toEqual([]);
  });

  it("reports a deleted test file whose source is deleted from another directory only", () => {
    const diff = deletionOf("src/lib/foo.test.ts") + deletionOf("src/components/foo.ts", ["export const foo = 1;"]);

    expect(reportsOf(diff)).toEqual([{ rule: "deleted-test-file", file: "src/lib/foo.test.ts", line: null }]);
  });

  it("reports a deleted test file whose source is changed but kept", () => {
    const diff = deletionOf("src/lib/foo.test.ts") + diffOf("src/lib/foo.ts", ["-export const foo = 1;", "+export const foo = 2;"]);

    expect(reportsOf(diff)).toEqual([{ rule: "deleted-test-file", file: "src/lib/foo.test.ts", line: null }]);
  });

  it("reports a deleted e2e spec", () => {
    const diff = deletionOf("e2e/home.spec.ts", ["test('home', async () => {});"]);

    expect(reportsOf(diff)).toEqual([{ rule: "deleted-test-file", file: "e2e/home.spec.ts", line: null }]);
  });

  it("reports a deleted e2e spec even when a same-named file is deleted beside it", () => {
    const diff = deletionOf("e2e/home.spec.ts", ["test('home', async () => {});"]) + deletionOf("e2e/home.ts", ["export const x = 1;"]);

    expect(reportsOf(diff)).toEqual([{ rule: "deleted-test-file", file: "e2e/home.spec.ts", line: null }]);
  });

  it("reports a test file renamed to a name that is no longer a test, under its old path", () => {
    const diff = renameOf("src/lib/foo.test.ts", "src/lib/foo.notes.ts");

    expect(reportsOf(diff)).toEqual([{ rule: "deleted-test-file", file: "src/lib/foo.test.ts", line: null }]);
  });

  it("does not report a test file renamed to another test file", () => {
    const diff = renameOf("src/lib/foo.test.ts", "src/lib/bar.test.ts");

    expect(reportsOf(diff)).toEqual([]);
  });

  it("does not report a deleted file that is not a test", () => {
    const diff = deletionOf("src/lib/foo.ts", ["export const foo = 1;"]);

    expect(reportsOf(diff)).toEqual([]);
  });
});

describe("reportRules: fewer test cases", () => {
  const fewer = (file) => [{ rule: "fewer-test-cases", file, line: null }];

  it("reports a test file that loses an it case", () => {
    const diff = diffOf("src/a.test.ts", [" it('a', () => {});", "-it('b', () => {", "-  expect(1).toBe(1);", "-});"]);

    expect(reportsOf(diff)).toEqual(fewer("src/a.test.ts"));
  });

  it("reports an e2e spec that loses a test case", () => {
    const diff = diffOf("e2e/home.spec.ts", ["-test('home', async ({ page }) => {});", " test('search', async () => {});"]);

    expect(reportsOf(diff)).toEqual(fewer("e2e/home.spec.ts"));
  });

  it("reports once however many cases are lost", () => {
    const diff = diffOf("src/a.test.ts", ["-it('a', () => {});", "-it('b', () => {});", "-it('c', () => {});", "+it('d', () => {});"]);

    expect(reportsOf(diff)).toEqual(fewer("src/a.test.ts"));
  });

  it("does not report a case that is rewritten", () => {
    const diff = diffOf("src/a.test.ts", ["-it('a', () => {});", "+it('a, renamed', () => {});"]);

    expect(reportsOf(diff)).toEqual([]);
  });

  it("does not report added cases", () => {
    const diff = diffOf("src/a.test.ts", [" it('a', () => {});", "+it('b', () => {});", "+test('c', () => {});"]);

    expect(reportsOf(diff)).toEqual([]);
  });

  it("counts an it.each table as one case", () => {
    const diff = diffOf("src/a.test.ts", ["-it.each([1, 2, 3])('handles %s', (n) => {});", "+it('handles 1', () => {});"]);

    expect(reportsOf(diff)).toEqual([]);
  });

  it("reports two cases folded into one it.each", () => {
    const diff = diffOf("src/a.test.ts", ["-it('handles 1', () => {});", "-it('handles 2', () => {});", "+it.each([1, 2])('handles %s', (n) => {});"]);

    expect(reportsOf(diff)).toEqual(fewer("src/a.test.ts"));
  });

  it("does not count describe blocks, so unwrapping a describe is not reported", () => {
    const diff = diffOf("src/a.test.ts", ["-describe('outer', () => {", "-  describe('inner', () => {", "   it('a', () => {});", "-  });", "-});"]);

    expect(reportsOf(diff)).toEqual([]);
  });

  it("reports cases removed along with their nested describe", () => {
    const diff = diffOf("src/a.test.ts", [" describe('outer', () => {", "-  describe('inner', () => {", "-    it('a', () => {});", "-    it('b', () => {});", "-  });", " });"]);

    expect(reportsOf(diff)).toEqual(fewer("src/a.test.ts"));
  });

  it("reports a case that is commented out", () => {
    const diff = diffOf("src/a.test.ts", ["-it('a', () => {});", "+// it('a', () => {});"]);

    expect(reportsOf(diff)).toEqual(fewer("src/a.test.ts"));
  });

  it("does not report fewer cases when the file it tests is deleted in the same diff", () => {
    const diff = diffOf("src/lib/foo.test.ts", ["-it('a', () => {});"]) + deletionOf("src/lib/foo.ts", ["export const foo = 1;"]);

    expect(reportsOf(diff)).toEqual([]);
  });

  it("does not report a deleted test file a second time as fewer cases", () => {
    const diff = deletionOf("src/lib/foo.test.ts", ["it('a', () => {});", "it('b', () => {});"]);

    expect(reportsOf(diff)).toEqual([{ rule: "deleted-test-file", file: "src/lib/foo.test.ts", line: null }]);
  });

  it("does not count cases in a file that is not a test", () => {
    const diff = diffOf("src/lib/foo.ts", ["-it('a', () => {});", "-test(value);"]);

    expect(reportsOf(diff)).toEqual([]);
  });
});

describe("CLI and exported findings", () => {
  let repo;

  function git(...args) {
    return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], {
      cwd: repo,
      encoding: "utf8",
    }).trim();
  }

  /** Writes `files` and commits them; a null content deletes the file. */
  function commit(files) {
    for (const [path, content] of Object.entries(files)) {
      if (content === null) {
        rmSync(join(repo, path));
        continue;
      }
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(join(repo, path), content);
    }
    git("add", "-A");
    git("commit", "-q", "-m", "c");
    return git("rev-parse", "HEAD");
  }

  function startRepo() {
    repo = mkdtempSync(join(tmpdir(), "test-integrity-removals-"));
    git("init", "-q");
    return commit({
      "src/a.ts": "export const a = 1;\n",
      "src/a.test.ts": "it('a', () => {});\nit('b', () => {});\n",
      "src/gone.tsx": "export const Gone = 1;\n",
      "src/gone.test.tsx": "it('gone', () => {});\n",
      "e2e/home.spec.ts": "test('home', async () => {});\n",
    });
  }

  function runCli(args, env = {}) {
    return spawnSync("node", [CLI, ...args], { cwd: repo, encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "", ...env } });
  }

  afterEach(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
    repo = undefined;
  });

  it("exits zero and names each finding when head only skips and removes tests", () => {
    const base = startRepo();
    const head = commit({ "src/a.test.ts": "it('a', () => {});\nit.skip('b', () => {});\n", "e2e/home.spec.ts": null });

    const result = runCli([base, head]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("REPORT e2e/home.spec.ts deleted-test-file");
    expect(result.stdout).toContain("REPORT src/a.test.ts:2 skip");
  });

  it("exits zero when a test file is deleted together with the file it tests", () => {
    const base = startRepo();
    const head = commit({ "src/gone.tsx": null, "src/gone.test.tsx": null });

    const result = runCli([base, head]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no findings");
  });

  it("lists report findings in the job summary under a one-way heading", () => {
    const base = startRepo();
    const head = commit({ "src/a.test.ts": "it('a', () => {});\n" });
    const summary = join(repo, "summary.md");

    const result = runCli([base, head], { GITHUB_STEP_SUMMARY: summary });

    const written = readFileSync(summary, "utf8");
    expect(result.status).toBe(0);
    expect(written).toMatch(/^### Makes this PR one-way$/m);
    expect(written.slice(written.indexOf("Makes this PR one-way"))).toContain("| `src/a.test.ts` | - | fewer-test-cases |");
  });

  it("prints every finding with its list, file, line and rule as JSON with --json", () => {
    const base = startRepo();
    const head = commit({
      "src/a.ts": "// @ts-ignore\nexport const a: number = 1;\n",
      "src/a.test.ts": "it('a', () => {});\nit.todo('b');\n",
      "e2e/home.spec.ts": null,
    });

    const result = runCli(["--json", base, head]);

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      fail: [{ rule: "ts-ignore", file: "src/a.ts", line: 1 }],
      oneWay: [
        { rule: "deleted-test-file", file: "e2e/home.spec.ts", line: null },
        { rule: "todo", file: "src/a.test.ts", line: 2 },
      ],
    });
  });

  it("prints empty lists with --json when there are no findings", () => {
    const base = startRepo();
    const head = commit({ "src/a.ts": "export const a = 2;\n" });

    const result = runCli([base, head, "--json"]);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ fail: [], oneWay: [] });
  });

  it("returns the one-way findings of a range from oneWayFindings", () => {
    const base = startRepo();
    const head = commit({ "src/a.ts": "// @ts-ignore\nexport const a: number = 1;\n", "src/a.test.ts": "it('a', () => {});\nxit('b', () => {});\n" });

    const findings = oneWayFindings(base, head, { cwd: repo });

    expect(findings).toEqual([{ rule: "xit", file: "src/a.test.ts", line: 2 }]);
  });
});
