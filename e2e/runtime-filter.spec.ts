import { expect, test } from "@playwright/test";

// Only the URL and the selected pill: the preview reads live TMDB data, so the titles shown are not asserted.
test("choosing a runtime puts it in the URL, keeps the other filters and selects its pill", async ({ page }) => {
  await page.goto("/?type=tv&genre=18&decade=2010&rating=7&sort=release&page=2");
  const runtimes = page.getByRole("navigation", { name: "Runtime" });
  await expect(runtimes.getByRole("link", { name: "Any" })).toHaveAttribute("aria-current", "true");
  await runtimes.getByRole("link", { name: "Under 120 min" }).click();
  await expect(page).toHaveURL(/[?&]runtime=120(&|$)/);
  for (const kept of ["type=tv", "genre=18", "decade=2010", "rating=7", "sort=release"]) {
    await expect(page).toHaveURL(new RegExp(`[?&]${kept}(&|$)`));
  }
  await expect(page).not.toHaveURL(/[?&]page=/);
  await expect(runtimes.getByRole("link", { name: "Under 120 min" })).toHaveAttribute("aria-current", "true");
});

test("choosing Any removes the runtime from the URL", async ({ page }) => {
  await page.goto("/?runtime=90&decade=2010");
  const runtimes = page.getByRole("navigation", { name: "Runtime" });
  await expect(runtimes.getByRole("link", { name: "Under 90 min" })).toHaveAttribute("aria-current", "true");
  await runtimes.getByRole("link", { name: "Any" }).click();
  await expect(page).not.toHaveURL(/[?&]runtime=/);
  await expect(page).toHaveURL(/[?&]decade=2010(&|$)/);
  await expect(runtimes.getByRole("link", { name: "Any" })).toHaveAttribute("aria-current", "true");
});

test("an unknown runtime reads as Any", async ({ page }) => {
  await page.goto("/?runtime=100");
  await expect(page.getByRole("navigation", { name: "Runtime" }).getByRole("link", { name: "Any" })).toHaveAttribute("aria-current", "true");
});
