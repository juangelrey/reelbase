import { expect, test, type Page } from "@playwright/test";

// The store's key and entry format, from src/lib/watchlist/watchlist.ts. Written as literals, since a spec runs
// outside the app's module graph.
const STORAGE_KEY = "reelbase:watchlist:v3";

function watchlistLink(page: Page) {
  return page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Watchlist/ });
}

test.describe("header watchlist count", () => {
  test("a fresh browser shows the link with no count", async ({ page }) => {
    await page.goto("/");
    const link = watchlistLink(page);
    await expect(link).toHaveAttribute("href", "/watchlist");
    await expect(link).toHaveAccessibleName("Watchlist");
    await expect(link.getByTestId("watchlist-count")).toHaveCount(0);
  });

  // Only the title saved is used: the preview reads live TMDB data, so which title leads is not asserted.
  test("saving a title shows 1 and removing it hides the count, without a reload", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("main").locator('a[href^="/title/"]').first().click();
    await expect(page).toHaveURL(/\/title\/\d+/);

    // A reload would clear this, so its survival proves the count changed in place.
    await page.evaluate(() => Object.assign(window, { notReloaded: true }));
    const link = watchlistLink(page);
    const save = page.getByRole("button", { name: "Save to watchlist" });

    await save.click();
    await expect(save).toHaveAttribute("aria-pressed", "true");
    await expect(link.getByTestId("watchlist-count")).toHaveText("1");
    await expect(link).toHaveAccessibleName("Watchlist (1 saved)");

    await save.click();
    await expect(save).toHaveAttribute("aria-pressed", "false");
    await expect(link.getByTestId("watchlist-count")).toHaveCount(0);
    await expect(link).toHaveAccessibleName("Watchlist");

    expect(await page.evaluate(() => "notReloaded" in window)).toBe(true);
  });

  test("a watchlist already in storage shows its count on the home page, with no hydration warning", async ({ page }) => {
    const messages: string[] = [];
    page.on("console", (message) => messages.push(message.text()));
    page.on("pageerror", (error) => messages.push(error.message));
    const entries = [
      { kind: "movie", id: 11, slug: "star-wars", name: "Star Wars", year: 1977 },
      { kind: "movie", id: 603, slug: "the-matrix", name: "The Matrix", year: 1999 },
      { kind: "tv", id: 1399, slug: "game-of-thrones", name: "Game of Thrones", year: 2011 },
    ];
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [STORAGE_KEY, JSON.stringify(entries)] as const,
    );

    await page.goto("/");
    const link = watchlistLink(page);
    await expect(link.getByTestId("watchlist-count")).toHaveText("3");
    await expect(link).toHaveAccessibleName("Watchlist (3 saved)");

    // Development builds name the mismatch; production builds log minified React errors 418, 423 and 425.
    expect(messages.filter((text) => /hydrat|react\.dev\/errors\/4(18|23|25)\b/i.test(text))).toEqual([]);
  });
});
