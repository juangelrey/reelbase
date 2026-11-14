import { expect, test } from "@playwright/test";

// Loaded with `page.goto`, not the `request` fixture: on a preview both carry the Vercel bypass cookie, and a failed
// `request.get` prints its headers, cookie included, to the public CI log and the report.
test.describe("Sentry example scaffolding", () => {
  test("the example page is gone", async ({ page }) => {
    const response = await page.goto("/sentry-example-page");
    expect(response?.status()).toBe(404);
  });

  test("the example API route is gone", async ({ page }) => {
    const response = await page.goto("/api/sentry-example-api");
    expect(response?.status()).toBe(404);
  });
});
