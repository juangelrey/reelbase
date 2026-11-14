// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A dummy: no test here may use a real bypass secret.
const SECRET = "dummy-bypass-secret-for-tests";
const PREVIEW = "https://reelbase-preview.example.invalid";

let temp;
const servers = [];

beforeEach(() => {
  temp = mkdtempSync(join(tmpdir(), "playwright-preview-"));
  vi.stubEnv("PLAYWRIGHT_BASE_URL", undefined);
  vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", undefined);
  vi.stubEnv("CI", undefined);
  vi.stubEnv("RUNNER_TEMP", temp);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
  rmSync(temp, { recursive: true, force: true });
});

/** The config reads the environment when it is imported, so each test imports a fresh copy. */
async function loadConfig() {
  vi.resetModules();
  return (await import("../playwright.config.ts")).default;
}

/** A stand-in for a protected preview: it records each request and answers with `handler`. */
async function startServer(handler) {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ url: req.url, headers: req.headers });
    handler(req, res);
  });
  servers.push(server);
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { origin: `http://127.0.0.1:${server.address().port}`, requests };
}

/** Vercel's protection: 401 without the cookie; the right bypass header sets the cookie and redirects back. */
function protectedPreview(req, res) {
  if (req.headers["x-vercel-protection-bypass"] === SECRET && req.headers["x-vercel-set-bypass-cookie"] === "true") {
    res.writeHead(307, { location: req.url, "set-cookie": "_vercel_jwt=stub-cookie; Path=/; HttpOnly" });
  } else if ((req.headers.cookie ?? "").includes("_vercel_jwt=stub-cookie")) {
    res.writeHead(200);
  } else {
    res.writeHead(401);
  }
  res.end();
}

async function runGlobalSetup(baseURL, statePath = join(temp, "state.json")) {
  const { default: globalSetup } = await import("../e2e/global-setup.ts");
  const teardown = await globalSetup({ projects: [{ use: { baseURL, storageState: statePath } }] });
  return { statePath, teardown };
}

describe("playwright.config.ts without PLAYWRIGHT_BASE_URL", () => {
  it("runs against the local dev server as before", async () => {
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", SECRET);

    const config = await loadConfig();

    expect(config.use).toEqual({ baseURL: "http://localhost:3000", trace: "retain-on-failure" });
    expect(config.webServer).toEqual({
      command: "pnpm dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    });
    expect(config.globalSetup).toBeUndefined();
  });

  it("keeps the list reporter and allows .only outside CI", async () => {
    const config = await loadConfig();

    expect(config.reporter).toBe("list");
    expect(config.forbidOnly).toBe(false);
  });
});

describe("playwright.config.ts in CI", () => {
  it("forbids .only, never retries, and adds an HTML report next to the list", async () => {
    vi.stubEnv("CI", "true");

    const config = await loadConfig();

    expect(config.forbidOnly).toBe(true);
    expect(config.retries).toBe(0);
    expect(config.reporter).toEqual([["list"], ["html", { open: "never" }]]);
  });
});

describe("playwright.config.ts with PLAYWRIGHT_BASE_URL", () => {
  it("targets the preview and starts no dev server", async () => {
    vi.stubEnv("PLAYWRIGHT_BASE_URL", PREVIEW);

    const config = await loadConfig();

    expect(config.use.baseURL).toBe(PREVIEW);
    expect(config.webServer).toBeUndefined();
  });

  it("records no trace or video, and a screenshot only on failure", async () => {
    vi.stubEnv("PLAYWRIGHT_BASE_URL", PREVIEW);

    const config = await loadConfig();

    expect(config.use).toMatchObject({ trace: "off", video: "off", screenshot: "only-on-failure" });
  });

  it("does no bypass setup when there is no secret", async () => {
    vi.stubEnv("PLAYWRIGHT_BASE_URL", PREVIEW);

    const config = await loadConfig();

    expect(config.globalSetup).toBeUndefined();
    expect(config.use.storageState).toBeUndefined();
  });

  it("with the secret, sets the bypass cookie in global setup and reuses it from $RUNNER_TEMP", async () => {
    vi.stubEnv("PLAYWRIGHT_BASE_URL", PREVIEW);
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", SECRET);

    const config = await loadConfig();

    expect(config.globalSetup).toMatch(/e2e[\\/]global-setup\.ts$/);
    expect(config.use.storageState).toBe(join(temp, "vercel-bypass-state.json"));
  });

  it("keeps the secret out of the config, so no header carries it to other hosts", async () => {
    vi.stubEnv("PLAYWRIGHT_BASE_URL", PREVIEW);
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", SECRET);

    const config = await loadConfig();

    expect(config.use.extraHTTPHeaders).toBeUndefined();
    expect(config.projects.map((project) => project.use.extraHTTPHeaders)).toEqual([undefined, undefined]);
    expect(JSON.stringify(config)).not.toContain(SECRET);
  });
});

describe("e2e/global-setup.ts", () => {
  it("sends the bypass headers to the preview once and saves the cookie it sets", async () => {
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", SECRET);
    const preview = await startServer(protectedPreview);

    const { statePath } = await runGlobalSetup(`${preview.origin}/`);

    const withSecret = preview.requests.filter((request) => request.headers["x-vercel-protection-bypass"] !== undefined);
    expect(withSecret).toHaveLength(1);
    expect(withSecret[0].headers).toMatchObject({ "x-vercel-protection-bypass": SECRET, "x-vercel-set-bypass-cookie": "true" });
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    expect(state.cookies).toMatchObject([{ name: "_vercel_jwt", value: "stub-cookie", domain: "127.0.0.1" }]);
  });

  it("sends the secret to the root of the preview's origin, whatever path and query the base URL has", async () => {
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", SECRET);
    const preview = await startServer(protectedPreview);

    await runGlobalSetup(`${preview.origin}/search?next=https://other.example.invalid/`);

    const withSecret = preview.requests.filter((request) => request.headers["x-vercel-protection-bypass"] !== undefined);
    expect(withSecret.map((request) => request.url)).toEqual(["/"]);
  });

  it("refuses a preview that is not https before sending the secret", async () => {
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", SECRET);

    const failure = await runGlobalSetup("http://reelbase-preview.example.invalid").catch((error) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toContain("must be https");
    expect(String(failure.stack)).not.toContain(SECRET);
  });

  it("saves only the cookie, never the secret", async () => {
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", SECRET);
    const preview = await startServer(protectedPreview);

    const { statePath } = await runGlobalSetup(preview.origin);

    expect(readFileSync(statePath, "utf8")).not.toContain(SECRET);
  });

  it("does not follow a redirect to another host with the secret", async () => {
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", SECRET);
    const other = await startServer((req, res) => res.writeHead(200).end());
    const preview = await startServer((req, res) => {
      if (req.headers["x-vercel-protection-bypass"]) {
        res.writeHead(307, { location: `${other.origin}/`, "set-cookie": "_vercel_jwt=stub-cookie; Path=/" });
      } else {
        res.writeHead(200);
      }
      res.end();
    });

    await runGlobalSetup(preview.origin);

    expect(other.requests).toEqual([]);
  });

  it("removes the saved cookie when the run ends", async () => {
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", SECRET);
    const preview = await startServer(protectedPreview);

    const { statePath, teardown } = await runGlobalSetup(preview.origin);
    await teardown();

    expect(existsSync(statePath)).toBe(false);
  });

  it("fails when the preview still answers 401, without naming the secret", async () => {
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", SECRET);
    const preview = await startServer((req, res) => res.writeHead(401).end());

    const failure = await runGlobalSetup(preview.origin).catch((error) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toContain("401");
    expect(String(failure.stack)).not.toContain(SECRET);
    expect(existsSync(join(temp, "state.json"))).toBe(false);
  });

  it.each([
    ["a redirect to a login page", 302],
    ["403", 403],
    ["a server error", 500],
  ])("fails when the preview answers %s to the cookie, since nothing but a page proves the bypass", async (_, code) => {
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", SECRET);
    const preview = await startServer((req, res) => res.writeHead(code, code === 302 ? { location: "/login" } : {}).end());

    const failure = await runGlobalSetup(preview.origin).catch((error) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toContain(String(code));
    expect(String(failure.stack)).not.toContain(SECRET);
    expect(existsSync(join(temp, "state.json"))).toBe(false);
  });

  it("fails when the preview cannot be reached, without naming the secret", async () => {
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", SECRET);
    const preview = await startServer((req) => req.socket.destroy());

    const failure = await runGlobalSetup(preview.origin).catch((error) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toContain(preview.origin);
    expect(String(failure.stack)).not.toContain(SECRET);
    expect(String(failure.cause)).not.toContain(SECRET);
  });

  it("says the cookie could not be saved, not that the preview is unreachable, when the state file cannot be written", async () => {
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", SECRET);
    const preview = await startServer(protectedPreview);
    const notADirectory = join(temp, "a-file");
    writeFileSync(notADirectory, "");

    const failure = await runGlobalSetup(preview.origin, join(notADirectory, "state.json")).catch((error) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toContain("Could not save");
    expect(failure.message).not.toContain("Could not reach");
    expect(String(failure.stack)).not.toContain(SECRET);
  });
});

const CODE_FILE = /\.[cm]?[jt]sx?$/;

// Any way a file can reach Playwright's request API: the `request` fixture or export by name, renamed on import or
// by destructuring; a `.request` or `["request"]` property; or its type. `.request(` stays allowed: it is the
// method on a response or a route that returns the page's own request.
const REQUEST_API = [
  /[{,]\s*["']?request["']?\s*[,}:=]/,
  /\brequest\s+as\b/,
  /\.\s*request\b(?!\s*\()/,
  /\[\s*["'`]request["'`]\s*\]/,
  /\bAPIRequestContext\b/,
];

/** Whether the source of a file under e2e/ uses Playwright's request API. */
function usesRequestAPI(source) {
  return REQUEST_API.some((pattern) => pattern.test(source));
}

/** The code files under `dir`, at any depth, that use Playwright's request API, as sorted paths relative to `dir`. */
function requestAPIOffenders(dir) {
  return readdirSync(dir, { recursive: true })
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => CODE_FILE.test(file) && usesRequestAPI(readFileSync(join(dir, file), "utf8")))
    .sort();
}

// A failed call on Playwright's request API (the `request` fixture, `page.request`, `context.request`) lists the
// request headers in its error, and with them the bypass cookie: in the public CI log and in the HTML report.
// A failed `page.goto` lists none.
describe("e2e specs", () => {
  it("never use Playwright's request API, whose errors print the bypass cookie", () => {
    const e2e = fileURLToPath(new URL("../e2e/", import.meta.url));

    // The global setup is the one user: it rewrites every error before it leaves.
    expect(requestAPIOffenders(e2e).filter((file) => file !== "global-setup.ts")).toEqual([]);
  });
});

describe("the request API guard", () => {
  it.each([
    ["the request fixture", 'test("a", async ({ request }) => {});'],
    ["the request fixture beside another", 'test("a", async ({ page, request }) => {});'],
    ["the request fixture under another name", 'test("a", async ({ request: api }) => {});'],
    ["the request export", 'import { request } from "@playwright/test";'],
    ["the request export beside another", 'import { expect, request, test } from "@playwright/test";'],
    ["the request export under another name", 'import { request as r } from "@playwright/test";'],
    ["the request export on a line of its own", 'import {\n  test,\n  request as r,\n} from "@playwright/test";'],
    ["page.request", 'await page.request.get("/api");'],
    ["context.request across lines", 'await page\n  .context()\n  .request.get("/api");'],
    ["optional access", 'await page?.request.get("/api");'],
    ["bracket access with double quotes", 'await page["request"].get("/api");'],
    ["bracket access with single quotes", "await page['request'].get('/api');"],
    ["bracket access with a template string", 'await page[`request`].get("/api");'],
    ["a quoted key when destructuring", 'const { "request": api } = page;'],
    ["the request API through the namespace", 'const api = await playwright.request.newContext();'],
    ["the request API's type", "let api: APIRequestContext;"],
  ])("finds %s", (_, source) => {
    expect(usesRequestAPI(source)).toBe(true);
  });

  it.each([
    ["page.goto", 'await page.goto("/");'],
    ["the request a response answers", "const sent = response.request();"],
    ["the request a route handles", 'await page.route("**/api", (route) => route.fulfill({ body: route.request().url() }));'],
    ["waiting for a request", 'await page.waitForRequest("**/api");'],
    ["the word in a test name", 'test("sends one request, then stops", async ({ page }) => {});'],
  ])("allows %s", (_, source) => {
    expect(usesRequestAPI(source)).toBe(false);
  });

  it("finds a use in a file of any code extension, at any depth", () => {
    const files = {
      "home.spec.ts": 'test("a", async ({ page }) => {});',
      "top.spec.ts": 'test("a", async ({ request }) => {});',
      "helpers/api.ts": "export const get = (page) => page.request.get('/api');",
      "admin/x.spec.ts": 'test("a", async ({ request }) => {});',
      "admin/deep/y.spec.tsx": 'test("a", async ({ request }) => {});',
      "helpers/plain.js": "export const get = (page) => page.request.get('/api');",
      "helpers/module.mjs": "export const get = (page) => page.request.get('/api');",
      "helpers/common.cts": "export const get = (page) => page.request.get('/api');",
      "helpers/notes.md": "Never use page.request in a spec.",
    };
    for (const [path, source] of Object.entries(files)) {
      mkdirSync(dirname(join(temp, path)), { recursive: true });
      writeFileSync(join(temp, path), source);
    }

    expect(requestAPIOffenders(temp)).toEqual([
      "admin/deep/y.spec.tsx",
      "admin/x.spec.ts",
      "helpers/api.ts",
      "helpers/common.cts",
      "helpers/module.mjs",
      "helpers/plain.js",
      "top.spec.ts",
    ]);
  });
});
