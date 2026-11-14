import { rm } from "node:fs/promises";

import { request, type FullConfig } from "@playwright/test";

/**
 * Gets the tests through Vercel's deployment protection on a preview. One request carries the bypass secret, to the
 * preview's origin only, and asks Vercel for the bypass cookie; the cookie is saved as storage state, which every
 * browser context and `request` fixture then starts from. The secret is not put in `extraHTTPHeaders`, since those
 * go to every host a page loads from (TMDB images, Sentry). The config runs this only when both
 * `PLAYWRIGHT_BASE_URL` and `VERCEL_AUTOMATION_BYPASS_SECRET` are set.
 *
 * Errors are rewritten before they leave this function: Playwright's own request errors list the request headers,
 * which would put the secret in the log and the report.
 */
export default async function globalSetup(config: FullConfig) {
  const { baseURL, storageState } = config.projects[0].use;
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!baseURL || typeof storageState !== "string" || !secret) {
    throw new Error("The Vercel bypass setup needs a base URL, a storage state path and VERCEL_AUTOMATION_BYPASS_SECRET.");
  }
  const origin = new URL(baseURL).origin;

  const context = await request.newContext();
  let status: number;
  try {
    // Redirects are not followed, so the secret cannot travel on to wherever the preview points.
    await context.get(origin, {
      headers: { "x-vercel-protection-bypass": secret, "x-vercel-set-bypass-cookie": "true" },
      maxRedirects: 0,
    });
    // Without the secret: the cookie alone must now open the preview.
    status = (await context.get(origin, { maxRedirects: 0 })).status();
    await context.storageState({ path: storageState });
  } catch {
    throw new Error(`Could not reach ${origin} to set the Vercel bypass cookie.`);
  } finally {
    await context.dispose();
  }
  if (status === 401) {
    await rm(storageState, { force: true });
    throw new Error(`${origin} still answers 401 after the bypass request: check VERCEL_AUTOMATION_BYPASS_SECRET.`);
  }

  // The saved cookie opens the preview, so it does not outlive the run.
  return () => rm(storageState, { force: true });
}
