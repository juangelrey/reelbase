import { rm } from "node:fs/promises";

import { request, type FullConfig } from "@playwright/test";

/** Hosts the secret may go to over plain http: a stand-in preview on this machine. */
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Gets the tests through Vercel's deployment protection on a preview. One request carries the bypass secret, to the
 * preview's origin only, and asks Vercel for the bypass cookie; the cookie is saved as storage state, which every
 * browser context then starts from. The secret is not put in `extraHTTPHeaders`, since those go to every host a
 * page loads from (TMDB images, Sentry). The config runs this only when both `PLAYWRIGHT_BASE_URL` and
 * `VERCEL_AUTOMATION_BYPASS_SECRET` are set.
 *
 * Errors are rewritten before they leave this function: Playwright's own request errors list the request headers,
 * which would put the secret in the log and the report. The same holds for the cookie in a spec, where nothing can
 * rewrite the error, so specs load pages with `page.goto` and never use the `request` fixture or `page.request`.
 */
export default async function globalSetup(config: FullConfig) {
  const { baseURL, storageState } = config.projects[0].use;
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!baseURL || typeof storageState !== "string" || !secret) {
    throw new Error("The Vercel bypass setup needs a base URL, a storage state path and VERCEL_AUTOMATION_BYPASS_SECRET.");
  }
  const { origin, protocol, hostname } = new URL(baseURL);
  if (protocol !== "https:" && !LOOPBACK.includes(hostname)) {
    throw new Error(`${origin} must be https to be sent the Vercel bypass secret.`);
  }

  const context = await request.newContext();
  try {
    let status: number;
    try {
      // Redirects are not followed, so the secret cannot travel on to wherever the preview points.
      await context.get(origin, {
        headers: { "x-vercel-protection-bypass": secret, "x-vercel-set-bypass-cookie": "true" },
        maxRedirects: 0,
      });
      // Without the secret: the cookie alone must now open the preview.
      status = (await context.get(origin, { maxRedirects: 0 })).status();
    } catch {
      throw new Error(`Could not reach ${origin} to set the Vercel bypass cookie.`);
    }
    // Only a page proves the bypass: protection can also answer with a redirect to a login page, or a 403.
    if (status >= 300) {
      throw new Error(`${origin} answers ${status} after the bypass request: check VERCEL_AUTOMATION_BYPASS_SECRET.`);
    }
    try {
      await context.storageState({ path: storageState });
    } catch {
      throw new Error(`Could not save the Vercel bypass cookie to ${storageState}.`);
    }
  } finally {
    await context.dispose();
  }

  // The saved cookie opens the preview, so it does not outlive the run.
  return () => rm(storageState, { force: true });
}
