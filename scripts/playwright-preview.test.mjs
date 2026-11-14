// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

async function runGlobalSetup(baseURL) {
  const statePath = join(temp, "state.json");
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
});
