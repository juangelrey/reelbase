// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { classify, classifyFile, formatMarkdown, parseNameStatus } from "./door.mjs";

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
    expect(classify([])).toEqual({ verdict: "two-way", files: [] });
  });
});

describe("formatMarkdown", () => {
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

  it("exits 2 when git cannot read the range", () => {
    startRepo();

    const run = runCli(["--base", "0000000000000000000000000000000000000000"]);

    expect(run.status).toBe(2);
    expect(run.stderr).toContain("door:");
    expect(run.stdout).toBe("");
  });
});
