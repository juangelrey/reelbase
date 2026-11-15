import { expect, test } from "@playwright/test";

// The preview's flag state is LaunchDarkly's, so the header says which status applies: with flag `settings-page`
// on it shows the gear link, and /settings is a page; with it off there is no link, and /settings is a real 404,
// not a 200 showing the not-found page.
test("/settings answers 200 while the header links to it, and 404 otherwise", async ({ page }) => {
  await page.goto("/");
  const flagOn = (await page.getByRole("banner").getByRole("link", { name: "Settings" }).count()) > 0;

  const response = await page.goto("/settings");
  expect(response?.status()).toBe(flagOn ? 200 : 404);
});
