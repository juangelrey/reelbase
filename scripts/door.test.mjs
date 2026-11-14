// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { classify, classifyFile, classifyRange, formatMarkdown, parseModes, parseNameStatus } from "./door.mjs";

const CLI = fileURLToPath(new URL("./door.mjs", import.meta.url));

const edited = (path) => ({ status: "modified", path, oldPath: path });
const added = (path) => ({ status: "added", path, oldPath: null });
const deleted = (path) => ({ status: "deleted", path, oldPath: path });
const renamed = (oldPath, path) => ({ status: "renamed", path, oldPath });

describe("parseNameStatus", () => {
  it("reads added, modified and deleted files from NUL-separated output", () => {
    const text = "A\0src/a.ts\0M\0src/b.ts\0D\0src/c.ts\0";

    expect(parseNameStatus(text)).toEqual([
      { status: "added", path: "src/a.ts", oldPath: null },
      { status: "modified", path: "src/b.ts", oldPath: "src/b.ts" },
      { status: "deleted", path: "src/c.ts", oldPath: "src/c.ts" },
    ]);
  });

  it("reads a rename as one change with its old and new path", () => {
    const text = "R087\0src/app/old/page.tsx\0src/app/new/page.tsx\0M\0README.md\0";

    expect(parseNameStatus(text)).toEqual([
      { status: "renamed", path: "src/app/new/page.tsx", oldPath: "src/app/old/page.tsx" },
      { status: "modified", path: "README.md", oldPath: "README.md" },
    ]);
  });

  it("reads a copy as one added file and stays aligned on the entry after it", () => {
    const text = "C100\0src/components/old.tsx\0src/components/new.tsx\0M\0README.md\0";

    expect(parseNameStatus(text)).toEqual([
      { status: "added", path: "src/components/new.tsx", oldPath: null },
      { status: "modified", path: "README.md", oldPath: "README.md" },
    ]);
  });

  it("keeps a status it does not know, so the file is classified one-way", () => {
    const [change] = parseNameStatus("T\0src/components/card.tsx\0");

    expect(change.status).toBe("other");
    expect(classifyFile(change).class).toBe("one-way");
  });

  it("returns no changes for an empty diff", () => {
    expect(parseNameStatus("")).toEqual([]);
  });
});

describe("classifyFile: one-way rules", () => {
  it.each([
    ["package.json", "dependencies"],
    ["pnpm-lock.yaml", "dependencies"],
    [".nvmrc", "dependencies"],
    [".github/workflows/ci.yml", "CI"],
    [".github/dependabot.yml", "CI"],
    ["next.config.ts", "framework or deploy config"],
    ["next.config.mjs", "framework or deploy config"],
    ["vercel.json", "framework or deploy config"],
    ["tsconfig.json", "framework or deploy config"],
    ["eslint.config.mjs", "framework or deploy config"],
    ["postcss.config.mjs", "framework or deploy config"],
    ["vitest.config.ts", "framework or deploy config"],
    ["vitest.setup.ts", "framework or deploy config"],
    ["playwright.config.ts", "framework or deploy config"],
    [".env", "environment variables"],
    [".env.example", "environment variables"],
    [".env.local", "environment variables"],
    ["sentry.server.config.ts", "observability config"],
    ["sentry.edge.config.ts", "observability config"],
    ["src/instrumentation.ts", "observability config"],
    ["src/instrumentation-client.ts", "observability config"],
    ["src/lib/flags/index.ts", "feature flags"],
    ["src/lib/watchlist/store.ts", "persisted data"],
    ["src/lib/watchlist/store.test.ts", "persisted data"],
    ["scripts/door.mjs", "scripts"],
    [".claude/skills/as-build/SKILL.md", "agent instructions"],
    [".claude/settings.json", "agent instructions"],
    ["CLAUDE.md", "agent instructions"],
    ["AGENTS.md", "agent instructions"],
    [".gitattributes", "git attributes"],
    ["src/components/.gitattributes", "git attributes"],
    ["docs/.gitattributes", "git attributes"],
    ["e2e/.gitattributes", "git attributes"],
  ])("%s edited is one-way (%s)", (path, reason) => {
    const result = classifyFile(edited(path));

    expect(result.class).toBe("one-way");
    expect(result.reason).toContain(reason);
  });

  it("is one-way for a one-way path whether it is added, edited or deleted", () => {
    expect(classifyFile(added("src/lib/watchlist/migrate.ts")).class).toBe("one-way");
    expect(classifyFile(deleted("src/lib/watchlist/store.ts")).class).toBe("one-way");
  });

  it("matches a config file name in a subdirectory too", () => {
    expect(classifyFile(edited("src/components/package.json")).class).toBe("one-way");
    expect(classifyFile(added("docs/AGENTS.md")).class).toBe("one-way");
  });

  it.each([
    ["Package.json", "dependencies"],
    [".GitHub/workflows/ci.yml", "CI"],
    ["Next.Config.ts", "framework or deploy config"],
    [".ENV.local", "environment variables"],
    ["Sentry.server.config.ts", "observability config"],
    ["src/Instrumentation.ts", "observability config"],
    ["src/lib/Flags/index.ts", "feature flags"],
    ["src/lib/Watchlist/store.ts", "persisted data"],
    ["Scripts/door.mjs", "scripts"],
    [".Claude/settings.json", "agent instructions"],
    ["agents.md", "agent instructions"],
  ])("%s edited is one-way whatever its case (%s)", (path, reason) => {
    const result = classifyFile(edited(path));

    expect(result.class).toBe("one-way");
    expect(result.reason).toContain(reason);
  });

  it("is one-way for a deleted page whose name differs in case", () => {
    const result = classifyFile(deleted("src/app/foo/Page.tsx"));

    expect(result.class).toBe("one-way");
    expect(result.reason).toMatch(/public route/);
  });

  it.each(["src/app/foo/page.tsx", "src/app/page.tsx", "src/app/api/titles/route.ts", "src/app/(browse)/[id]/page.tsx"])(
    "%s deleted is one-way, because it removes a public route",
    (path) => {
      const result = classifyFile(deleted(path));

      expect(result.class).toBe("one-way");
      expect(result.reason).toMatch(/public route/);
    },
  );

  it("is one-way for a renamed page, naming the route it moved from", () => {
    const result = classifyFile(renamed("src/app/old/page.tsx", "src/app/new/page.tsx"));

    expect(result.class).toBe("one-way");
    expect(result.reason).toMatch(/public route/);
    expect(result.reason).toContain("src/app/old/page.tsx");
  });

  it("is one-way for a renamed route handler", () => {
    const result = classifyFile(renamed("src/app/api/a/route.ts", "src/app/api/b/route.ts"));

    expect(result.class).toBe("one-way");
    expect(result.reason).toMatch(/public route/);
  });

  it("is one-way for a file renamed out of a one-way area", () => {
    const result = classifyFile(renamed("src/lib/watchlist/format.ts", "src/components/format.ts"));

    expect(result.class).toBe("one-way");
    expect(result.reason).toContain("persisted data");
  });

  it("is one-way for a file renamed into a one-way area", () => {
    const result = classifyFile(renamed("src/components/format.ts", "src/lib/watchlist/format.ts"));

    expect(result.class).toBe("one-way");
    expect(result.reason).toContain("persisted data");
  });
});

describe("classifyFile: file kinds", () => {
  it.each([
    ["120000", "symbolic link"],
    ["160000", "submodule"],
  ])("a file of mode %s under a two-way directory is one-way (%s)", (mode, reason) => {
    expect(classifyFile({ ...added("src/components/thing"), mode })).toEqual({ file: "src/components/thing", class: "one-way", reason });
  });

  it("an ordinary file's mode leaves its path rules in charge", () => {
    expect(classifyFile({ ...added("src/components/card.tsx"), mode: "100644" }).class).toBe("two-way");
  });
});

describe("parseModes", () => {
  it("maps each path to its mode at head", () => {
    const text = ":000000 120000 0000000 1111111 A\0src/components/link.tsx\0:100644 100755 2222222 3333333 M\0e2e/run.ts\0";

    expect(parseModes(text)).toEqual(new Map([["src/components/link.tsx", "120000"], ["e2e/run.ts", "100755"]]));
  });

  it("returns an empty map for an empty diff", () => {
    expect(parseModes("")).toEqual(new Map());
  });
});

describe("classifyFile: one-way by default", () => {
  it.each(["src/lib/unknown/thing.ts", "src/middleware.ts", "public/logo.svg", "Dockerfile", "src/lib/util.ts", ".gitignore"])(
    "%s matches no rule, so it is one-way",
    (path) => {
      const result = classifyFile(edited(path));

      expect(result.class).toBe("one-way");
      expect(result.reason).toMatch(/no two-way rule/);
    },
  );

  it("is one-way for a deleted e2e spec", () => {
    const result = classifyFile(deleted("e2e/browse.spec.ts"));

    expect(result.class).toBe("one-way");
    expect(result.reason).toMatch(/delet/);
  });

  it("is one-way for a renamed e2e spec", () => {
    expect(classifyFile(renamed("e2e/browse.spec.ts", "e2e/home.spec.ts")).class).toBe("one-way");
  });

  it("is one-way for a deleted file under src/app that is not a page or route", () => {
    expect(classifyFile(deleted("src/app/foo/loading.tsx")).class).toBe("one-way");
  });

  it("does not take a look-alike directory for a two-way area", () => {
    expect(classifyFile(edited("src/components-old/card.tsx")).class).toBe("one-way");
    expect(classifyFile(edited("src/lib/catalogue/index.ts")).class).toBe("one-way");
    expect(classifyFile(edited("lib/src/components/card.tsx")).class).toBe("one-way");
  });
});

describe("classifyFile: two-way allowlist", () => {
  it.each([
    edited("src/components/title-card.tsx"),
    added("src/components/rail/rail.tsx"),
    deleted("src/components/old-card.tsx"),
    renamed("src/components/a.tsx", "src/components/b.tsx"),
    edited("src/app/foo/page.tsx"),
    added("src/app/bar/page.tsx"),
    added("src/app/api/new/route.ts"),
    edited("src/app/layout.tsx"),
    edited("src/app/globals.css"),
    edited("src/lib/catalog/index.ts"),
    edited("src/lib/theme/tokens.ts"),
    deleted("src/lib/tmdb/client.ts"),
    added("e2e/watchlist.spec.ts"),
    edited("e2e/browse.spec.ts"),
    edited("docs/software-factory-plan.md"),
    deleted("docs/old.png"),
    edited("README.md"),
    added("src/lib/notes.md"),
  ])("$status $path is two-way", (change) => {
    const result = classifyFile(change);

    expect(result.class).toBe("two-way");
    expect(result.reason).not.toBe("");
  });

  it("checks one-way rules first: a page edited is two-way and the same page deleted is one-way", () => {
    expect(classifyFile(edited("src/app/foo/page.tsx")).class).toBe("two-way");
    expect(classifyFile(deleted("src/app/foo/page.tsx")).class).toBe("one-way");
  });

  it("checks one-way rules first: Markdown is two-way except inside .claude/", () => {
    expect(classifyFile(edited("docs/guide.md")).class).toBe("two-way");
    expect(classifyFile(edited(".claude/agents/code-reviewer.md")).class).toBe("one-way");
  });
});

describe("classify", () => {
  it("gives two-way for a diff confined to two-way paths", () => {
    const result = classify([edited("src/components/title-card.tsx"), added("src/app/bar/page.tsx"), edited("README.md")]);

    expect(result.verdict).toBe("two-way");
    expect(result.files.map((f) => f.class)).toEqual(["two-way", "two-way", "two-way"]);
  });

  it("gives one-way when any one file is one-way", () => {
    const result = classify([edited("src/components/title-card.tsx"), edited("package.json")]);

    expect(result.verdict).toBe("one-way");
    expect(result.files).toEqual([
      { file: "src/components/title-card.tsx", class: "two-way", reason: expect.any(String) },
      { file: "package.json", class: "one-way", reason: expect.any(String) },
    ]);
  });

  it("gives two-way for a diff with no files", () => {
    expect(classify([])).toEqual({ verdict: "two-way", files: [], integrity: [] });
  });
});

describe("classify with test-integrity findings", () => {
  it("gives one-way for two-way paths when a test is skipped", () => {
    const result = classify([edited("src/components/card.test.tsx")], [{ rule: "skip", file: "src/components/card.test.tsx", line: 12 }]);

    expect(result.verdict).toBe("one-way");
    expect(result.files).toEqual([{ file: "src/components/card.test.tsx", class: "two-way", reason: expect.any(String) }]);
    expect(result.integrity).toEqual([
      { file: "src/components/card.test.tsx", line: 12, rule: "skip", reason: "test removed or skipped" },
    ]);
  });

  it("keeps a whole-file finding, whose line is null", () => {
    const result = classify(
      [edited("src/components/card.test.tsx")],
      [{ rule: "fewer-test-cases", file: "src/components/card.test.tsx", line: null }],
    );

    expect(result.verdict).toBe("one-way");
    expect(result.integrity).toEqual([
      { file: "src/components/card.test.tsx", line: null, rule: "fewer-test-cases", reason: "test removed or skipped" },
    ]);
  });

  it("gives the path-rules verdict and an empty list when there are no findings", () => {
    expect(classify([edited("src/components/card.tsx")], [])).toEqual({
      verdict: "two-way",
      files: [{ file: "src/components/card.tsx", class: "two-way", reason: expect.any(String) }],
      integrity: [],
    });
  });
});

describe("formatMarkdown", () => {
  it("adds a row for each integrity finding, with its file and line", () => {
    const text = formatMarkdown(
      classify(
        [edited("src/components/card.test.tsx")],
        [
          { rule: "skip", file: "src/components/card.test.tsx", line: 12 },
          { rule: "fewer-test-cases", file: "src/components/card.test.tsx", line: null },
        ],
      ),
    );

    expect(text).toMatch(/\| `src\/components\/card\.test\.tsx` \| two-way \| .+ \|/);
    expect(text).toContain("| `src/components/card.test.tsx:12` | one-way | test removed or skipped (skip) |");
    expect(text).toContain("| `src/components/card.test.tsx` | one-way | test removed or skipped (fewer-test-cases) |");
    expect(text).toContain("**Door:** one-way (0 of 1 file(s) one-way, 2 test-integrity finding(s))");
  });

  it("does not mention integrity findings when there are none", () => {
    const text = formatMarkdown(classify([edited("src/components/card.tsx")]));

    expect(text).toContain("**Door:** two-way (0 of 1 file(s) one-way)\n");
  });

  it("prints one table row per file and the verdict", () => {
    const text = formatMarkdown(classify([edited("src/components/title-card.tsx"), edited("package.json")]));

    expect(text).toContain("| File | Class | Reason |");
    expect(text).toMatch(/\| `src\/components\/title-card\.tsx` \| two-way \| .+ \|/);
    expect(text).toMatch(/\| `package\.json` \| one-way \| .+ \|/);
    expect(text).toContain("**Door:** one-way");
  });

  it("says so when the diff has no files", () => {
    const text = formatMarkdown(classify([]));

    expect(text).toContain("No changed files.");
    expect(text).toContain("**Door:** two-way");
  });

  it("keeps a file name with a pipe inside its table cell", () => {
    const text = formatMarkdown(classify([edited("docs/a|b.md")]));

    expect(text).toContain("| `docs/a\\|b.md` | two-way |");
  });

  it("replaces a backtick in a file name, so it cannot close the code span", () => {
    const text = formatMarkdown(classify([edited("docs/a`b.md")]));

    expect(text).toContain("| `docs/a'b.md` | two-way |");
  });

  it("keeps a file name with a newline on one table row", () => {
    const text = formatMarkdown(classify([edited("docs/a\nb.md")]));

    expect(text).toContain("| `docs/a b.md` | two-way |");
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
    repo = mkdtempSync(join(tmpdir(), "door-"));
    git("init", "-q");
    return commit({
      "src/app/foo/page.tsx": "export default function Page() {\n  return <main>Foo page with enough text to be found again after a move</main>;\n}\n",
      "src/components/card.tsx": "export const Card = () => null;\n",
      "package.json": "{}\n",
    });
  }

  function runCli(args) {
    return spawnSync("node", [CLI, ...args], { cwd: repo, encoding: "utf8" });
  }

  afterEach(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
    repo = undefined;
  });

  it("prints a two-way table and exits 0 for a diff confined to two-way paths", () => {
    const base = startRepo();
    const head = commit({ "src/components/card.tsx": "export const Card = () => 1;\n" });

    const run = runCli(["--base", base, "--head", head]);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("| `src/components/card.tsx` | two-way |");
    expect(run.stdout).toContain("**Door:** two-way");
  });

  it("exits 0 for a one-way diff too, since the script informs and does not gate", () => {
    const base = startRepo();
    const head = commit({ "package.json": '{ "name": "x" }\n' });

    const run = runCli(["--base", base, "--head", head]);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("| `package.json` | one-way |");
    expect(run.stdout).toContain("**Door:** one-way");
  });

  it("sees a moved page as a rename and calls it one-way", () => {
    const base = startRepo();
    git("mv", "src/app/foo", "src/app/bar");
    const head = commit({});

    const run = runCli(["--base", base, "--head", head, "--json"]);

    expect(JSON.parse(run.stdout)).toEqual({
      verdict: "one-way",
      files: [{ file: "src/app/bar/page.tsx", class: "one-way", reason: expect.stringContaining("src/app/foo/page.tsx") }],
      integrity: [],
    });
  });

  it("prints the same data as JSON with --json", () => {
    const base = startRepo();
    const head = commit({ "src/components/card.tsx": "export const Card = () => 1;\n", "src/lib/util.ts": "export {};\n" });

    const run = runCli(["--json", "--base", base, "--head", head]);

    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({
      verdict: "one-way",
      files: [
        { file: "src/components/card.tsx", class: "two-way", reason: expect.any(String) },
        { file: "src/lib/util.ts", class: "one-way", reason: expect.any(String) },
      ],
      integrity: [],
    });
  });

  it("compares head with where it left base, ignoring what base gained since", () => {
    const fork = startRepo();
    git("checkout", "-q", "-b", "feature");
    const head = commit({ "src/components/card.tsx": "export const Card = () => 1;\n" });
    git("checkout", "-q", "-");
    const base = commit({ "package.json": '{ "name": "x" }\n' });

    const run = runCli(["--base", base, "--head", head, "--json"]);

    expect(fork).not.toBe(base);
    expect(JSON.parse(run.stdout).verdict).toBe("two-way");
  });

  const CARD_TEST = [
    'import { expect, it } from "vitest";',
    'it("renders", () => {',
    "  expect(1).toBe(1);",
    "});",
    'it("links", () => {',
    "  expect(2).toBe(2);",
    "});",
    "",
  ].join("\n");

  it("is one-way when a diff of only src/components edits skips a test", () => {
    startRepo();
    const base = commit({ "src/components/card.test.tsx": CARD_TEST });
    // The skip is spelled in two parts so the integrity gate does not report this file's own fixture.
    const head = commit({ "src/components/card.test.tsx": CARD_TEST.replace('it("links"', `it.${"skip"}("links"`) });

    const run = runCli(["--base", base, "--head", head, "--json"]);

    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({
      verdict: "one-way",
      files: [{ file: "src/components/card.test.tsx", class: "two-way", reason: expect.any(String) }],
      integrity: [{ file: "src/components/card.test.tsx", line: 5, rule: "skip", reason: "test removed or skipped" }],
    });
  });

  it("reports a skip in the --head commit when the checked-out commit has reverted it", () => {
    startRepo();
    const base = commit({ "src/components/card.test.tsx": CARD_TEST });
    const head = commit({ "src/components/card.test.tsx": CARD_TEST.replace('it("links"', `it.${"skip"}("links"`) });
    const checkedOut = commit({ "src/components/card.test.tsx": CARD_TEST });

    const run = runCli(["--base", base, "--head", head, "--json"]);

    expect(checkedOut).not.toBe(head);
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({
      verdict: "one-way",
      files: [{ file: "src/components/card.test.tsx", class: "two-way", reason: expect.any(String) }],
      integrity: [{ file: "src/components/card.test.tsx", line: 5, rule: "skip", reason: "test removed or skipped" }],
    });
  });

  it("is one-way when the skipped test is in a file that git takes for binary because it holds a NUL byte", () => {
    startRepo();
    const base = commit({ "src/components/card.test.tsx": CARD_TEST });
    const head = commit({
      "src/components/card.test.tsx": CARD_TEST.replace('it("links"', `it.${"skip"}("links"`) + "const nul = '\0';\n",
    });

    const run = runCli(["--base", base, "--head", head, "--json"]);

    expect(JSON.parse(run.stdout)).toEqual({
      verdict: "one-way",
      files: [{ file: "src/components/card.test.tsx", class: "two-way", reason: expect.any(String) }],
      integrity: [{ file: "src/components/card.test.tsx", line: 5, rule: "skip", reason: "test removed or skipped" }],
    });
  });

  it("is one-way for a .gitattributes under a two-way directory", () => {
    const base = startRepo();
    const head = commit({ "src/components/.gitattributes": "*.tsx -diff\n" });

    const run = runCli(["--base", base, "--head", head, "--json"]);

    expect(JSON.parse(run.stdout)).toEqual({
      verdict: "one-way",
      files: [{ file: "src/components/.gitattributes", class: "one-way", reason: expect.stringContaining("git attributes") }],
      integrity: [],
    });
  });

  it("still sees a skipped test once a .gitattributes that marks test files -diff is on the base branch", () => {
    startRepo();
    const base = commit({ "src/components/.gitattributes": "*.tsx -diff\n", "src/components/card.test.tsx": CARD_TEST });
    const head = commit({ "src/components/card.test.tsx": CARD_TEST.replace('it("links"', `it.${"skip"}("links"`) });

    const run = runCli(["--base", base, "--head", head, "--json"]);

    expect(JSON.parse(run.stdout)).toEqual({
      verdict: "one-way",
      files: [{ file: "src/components/card.test.tsx", class: "two-way", reason: expect.any(String) }],
      integrity: [{ file: "src/components/card.test.tsx", line: 5, rule: "skip", reason: "test removed or skipped" }],
    });
  });

  it("is one-way when a symbolic link is added under a two-way directory", () => {
    const base = startRepo();
    symlinkSync("../../package.json", join(repo, "src/components/link.tsx"));
    const head = commit({});

    const run = runCli(["--base", base, "--head", head, "--json"]);

    expect(JSON.parse(run.stdout)).toEqual({
      verdict: "one-way",
      files: [{ file: "src/components/link.tsx", class: "one-way", reason: "symbolic link" }],
      integrity: [],
    });
  });

  it("is one-way when a submodule is added under a two-way directory", () => {
    const base = startRepo();
    git("update-index", "--add", "--cacheinfo", `160000,${base},src/components/vendor`);
    git("commit", "-q", "-m", "c");

    const run = runCli(["--base", base, "--json"]);

    expect(JSON.parse(run.stdout)).toEqual({
      verdict: "one-way",
      files: [{ file: "src/components/vendor", class: "one-way", reason: "submodule" }],
      integrity: [],
    });
  });

  it("sees an added submodule even when the base branch's .gitmodules ignores it", () => {
    startRepo();
    const base = commit({ ".gitmodules": '[submodule "vendor"]\n\tpath = src/components/vendor\n\turl = ./x\n\tignore = all\n' });
    git("update-index", "--add", "--cacheinfo", `160000,${base},src/components/vendor`);
    git("commit", "-q", "-m", "c");

    const run = runCli(["--base", base, "--json"]);

    expect(JSON.parse(run.stdout)).toEqual({
      verdict: "one-way",
      files: [{ file: "src/components/vendor", class: "one-way", reason: "submodule" }],
      integrity: [],
    });
  });

  it("keeps each file's mode when a rename comes before a symbolic link in the diff", () => {
    startRepo();
    const base = commit({ "src/components/a-card.tsx": "export const ACard = () => 'a card with enough text to be found again';\n" });
    git("mv", "src/components/a-card.tsx", "src/components/b-card.tsx");
    symlinkSync("../../package.json", join(repo, "src/components/z-link.tsx"));
    const head = commit({});

    const run = runCli(["--base", base, "--head", head, "--json"]);

    expect(JSON.parse(run.stdout)).toEqual({
      verdict: "one-way",
      files: [
        { file: "src/components/b-card.tsx", class: "two-way", reason: expect.stringContaining("renamed from") },
        { file: "src/components/z-link.tsx", class: "one-way", reason: "symbolic link" },
      ],
      integrity: [],
    });
  });

  it("classifyRange reads the repository at cwd, not the one the process runs in", () => {
    startRepo();
    const base = commit({ "src/components/card.test.tsx": CARD_TEST });
    const head = commit({ "src/components/card.test.tsx": CARD_TEST.replace('it("links"', `it.${"skip"}("links"`) });

    const result = classifyRange(base, head, { cwd: repo });

    expect(process.cwd()).not.toBe(repo);
    expect(result).toEqual({
      verdict: "one-way",
      files: [{ file: "src/components/card.test.tsx", class: "two-way", reason: expect.any(String) }],
      integrity: [{ file: "src/components/card.test.tsx", line: 5, rule: "skip", reason: "test removed or skipped" }],
    });
  });

  it("is one-way when a case is removed from a test whose source remains", () => {
    startRepo();
    const base = commit({ "src/components/card.test.tsx": CARD_TEST });
    const head = commit({ "src/components/card.test.tsx": CARD_TEST.split("\n").slice(0, 4).join("\n") + "\n" });

    const run = runCli(["--base", base, "--head", head]);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("| `src/components/card.test.tsx` | two-way |");
    expect(run.stdout).toContain("| `src/components/card.test.tsx` | one-way | test removed or skipped (fewer-test-cases) |");
    expect(run.stdout).toContain("**Door:** one-way");
  });

  it("stays two-way when a test file is deleted together with the file it tests", () => {
    startRepo();
    const base = commit({ "src/components/card.test.tsx": CARD_TEST });
    git("rm", "-q", "src/components/card.tsx", "src/components/card.test.tsx");
    const head = commit({});

    const run = runCli(["--base", base, "--head", head, "--json"]);

    expect(JSON.parse(run.stdout)).toEqual({
      verdict: "two-way",
      files: [
        { file: "src/components/card.test.tsx", class: "two-way", reason: expect.any(String) },
        { file: "src/components/card.tsx", class: "two-way", reason: expect.any(String) },
      ],
      integrity: [],
    });
  });

  it("defaults head to HEAD", () => {
    const base = startRepo();
    commit({ "package.json": '{ "name": "x" }\n' });

    const run = runCli(["--base", base]);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("**Door:** one-way");
  });

  it("exits 2 with usage when --base is missing", () => {
    startRepo();

    const run = runCli(["--json"]);

    expect(run.status).toBe(2);
    expect(run.stderr).toContain("Usage:");
    expect(run.stdout).toBe("");
  });

  it("exits 2 on an option it does not know", () => {
    const base = startRepo();

    const run = runCli(["--base", base, "--force"]);

    expect(run.status).toBe(2);
    expect(run.stderr).toContain("Usage:");
  });

  it.each([
    ["--base", ["--base", "--output=pwned"]],
    ["--head", ["--base", "HEAD", "--head", "--output=pwned"]],
  ])("exits 2 when the %s ref starts with a dash, instead of passing it to git as an option", (_name, args) => {
    startRepo();

    const run = runCli(args);

    expect(run.status).toBe(2);
    expect(run.stderr).toContain("door:");
    expect(run.stdout).toBe("");
    expect(readdirSync(repo).filter((name) => name.includes("pwned"))).toEqual([]);
  });

  it("exits 2 when git cannot read the range", () => {
    startRepo();

    const run = runCli(["--base", "0000000000000000000000000000000000000000"]);

    expect(run.status).toBe(2);
    expect(run.stderr).toContain("door:");
    expect(run.stdout).toBe("");
  });
});
