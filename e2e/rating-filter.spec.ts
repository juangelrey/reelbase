import { expect, test } from "@playwright/test";

// Only the URL and the selected pill: the preview reads live TMDB data, so the titles shown are not asserted.
test("choosing a rating puts it in the URL and selects its pill", async ({ page }) => {
  await page.goto("/?decade=2010&page=2");
  const ratings = page.getByRole("navigation", { name: "Rating" });
  await expect(ratings.getByRole("link", { name: "Any" })).toHaveAttribute("aria-current", "true");
  await ratings.getByRole("link", { name: "7+" }).click();
  await expect(page).toHaveURL(/[?&]rating=7(&|$)/);
  await expect(page).toHaveURL(/[?&]decade=2010(&|$)/);
  await expect(page).not.toHaveURL(/[?&]page=/);
  await expect(ratings.getByRole("link", { name: "7+" })).toHaveAttribute("aria-current", "true");
});

test("choosing Any removes the rating from the URL", async ({ page }) => {
  await page.goto("/?rating=8&decade=2010");
  const ratings = page.getByRole("navigation", { name: "Rating" });
  await expect(ratings.getByRole("link", { name: "8+" })).toHaveAttribute("aria-current", "true");
  await ratings.getByRole("link", { name: "Any" }).click();
  await expect(page).not.toHaveURL(/[?&]rating=/);
  await expect(page).toHaveURL(/[?&]decade=2010(&|$)/);
  await expect(ratings.getByRole("link", { name: "Any" })).toHaveAttribute("aria-current", "true");
});

test("an unknown rating reads as Any", async ({ page }) => {
  await page.goto("/?rating=7.5");
  await expect(page.getByRole("navigation", { name: "Rating" }).getByRole("link", { name: "Any" })).toHaveAttribute("aria-current", "true");
});
