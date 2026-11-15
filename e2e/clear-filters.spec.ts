import { expect, test } from "@playwright/test";

// Only the URL and the link: the preview reads live TMDB data, so the titles shown are not asserted.
test("Clear filters drops the decade and then disappears", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Decade" }).getByRole("link", { name: "2010s" }).click();
  await expect(page).toHaveURL(/[?&]decade=2010(&|$)/);
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/[?&](decade|genre|providers|page)=/);
  await expect(page.getByRole("link", { name: "Clear filters" })).toHaveCount(0);
});
