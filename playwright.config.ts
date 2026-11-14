import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const LOCAL_URL = `http://localhost:${PORT}`;

/** A deployed Vercel preview to test instead of the local dev server. */
const previewURL = process.env.PLAYWRIGHT_BASE_URL;
/** The preview is behind deployment protection, which `e2e/global-setup.ts` gets the tests through. */
const bypassProtection = Boolean(previewURL && process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
const isCI = Boolean(process.env.CI);

/**
 * End-to-end tests in `e2e/`. They assert structure (a headline, ranks, filters), never which titles TMDB returns.
 *
 * Locally, `pnpm e2e` runs them against the dev server and the real TMDB API, so they need
 * `TMDB_READ_ACCESS_TOKEN` in `.env`.
 *
 * With `PLAYWRIGHT_BASE_URL` set they run against that deployed Vercel preview and no dev server is started; this
 * is how CI runs them, since CI has no token. With `VERCEL_AUTOMATION_BYPASS_SECRET` set as well, global setup
 * swaps the secret for Vercel's bypass cookie and the tests reuse the cookie as storage state, kept in
 * `$RUNNER_TEMP`. The repo is public and so are its CI artifacts: a preview run records no trace and no video,
 * which could hold that cookie, only a screenshot of a failure.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  // A flaky test must show as a failure.
  retries: 0,
  // With one worker per core, page loads against `next dev` never finish; two run cleanly.
  workers: 2,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: bypassProtection ? "./e2e/global-setup.ts" : undefined,
  use: previewURL
    ? {
        baseURL: previewURL,
        trace: "off",
        video: "off",
        screenshot: "only-on-failure",
        storageState: bypassProtection ? join(process.env.RUNNER_TEMP ?? tmpdir(), "vercel-bypass-state.json") : undefined,
      }
    : {
        baseURL: LOCAL_URL,
        trace: "retain-on-failure",
      },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: previewURL
    ? undefined
    : {
        command: "pnpm dev",
        url: LOCAL_URL,
        // Next allows one dev server per project, so a running one is used as it is.
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
