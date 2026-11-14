import { expect, test } from "@playwright/test";

// Only the URL and the selected pill: the preview reads live TMDB data, so the titles shown are not asserted.
test("choosing a decade puts it in the URL and selects its pill", async ({ page }) => {
  await page.goto("/");
  const decades = page.getByRole("navigation", { name: "Decade" });
  await decades.getByRole("link", { name: "2010s" }).click();
  await expect(page).toHaveURL(/[?&]decade=2010(&|$)/);
  await expect(decades.getByRole("link", { name: "2010s" })).toHaveAttribute("aria-current", "true");
});
