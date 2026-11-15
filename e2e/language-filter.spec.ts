import { expect, test } from "@playwright/test";

// Only the URL and the selected pill: the preview reads live TMDB data, so the titles shown are not asserted.
test("choosing a language puts it in the URL, keeps the other filters and selects its pill", async ({ page }) => {
  await page.goto("/?type=tv&genre=18&decade=2010&rating=7&runtime=120&sort=release&page=2");
  const languages = page.getByRole("navigation", { name: "Language" });
  await expect(languages.getByRole("link", { name: "Any" })).toHaveAttribute("aria-current", "true");
  await languages.getByRole("link", { name: "Spanish" }).click();
  await expect(page).toHaveURL(/[?&]language=es(&|$)/);
  for (const kept of ["type=tv", "genre=18", "decade=2010", "rating=7", "runtime=120", "sort=release"]) {
    await expect(page).toHaveURL(new RegExp(`[?&]${kept}(&|$)`));
  }
  await expect(page).not.toHaveURL(/[?&]page=/);
  await expect(languages.getByRole("link", { name: "Spanish" })).toHaveAttribute("aria-current", "true");
});

test("choosing Any removes the language from the URL", async ({ page }) => {
  await page.goto("/?language=ja&decade=2010");
  const languages = page.getByRole("navigation", { name: "Language" });
  await expect(languages.getByRole("link", { name: "Japanese" })).toHaveAttribute("aria-current", "true");
  await languages.getByRole("link", { name: "Any" }).click();
  await expect(page).not.toHaveURL(/[?&]language=/);
  await expect(page).toHaveURL(/[?&]decade=2010(&|$)/);
  await expect(languages.getByRole("link", { name: "Any" })).toHaveAttribute("aria-current", "true");
});

test("an unknown language reads as Any", async ({ page }) => {
  await page.goto("/?language=EN");
  await expect(page.getByRole("navigation", { name: "Language" }).getByRole("link", { name: "Any" })).toHaveAttribute("aria-current", "true");
});
