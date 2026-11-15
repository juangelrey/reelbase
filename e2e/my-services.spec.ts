import { expect, test } from "@playwright/test";

// Only the URL and the "Streaming on" line: the preview reads live TMDB data, so which service comes first is not asserted.
test("a service saved in Settings filters home, browsing keeps it, and unticking it returns home to any service", async ({ page }) => {
  await page.goto("/settings");
  const checkbox = page.getByRole("region", { name: "My services" }).getByRole("checkbox").first();
  // The checkbox is named by its label's text, the service name; the logo beside it is hidden from that name.
  const name = (await checkbox.locator("xpath=ancestor::label").innerText()).trim();
  await checkbox.check();
  await expect(checkbox).toBeChecked();

  await page.goto("/");
  const streamingOn = page.getByText(/^Streaming on:/);
  await expect(streamingOn).toContainText(name);
  await expect(streamingOn.getByRole("link", { name: "Change" })).toHaveAttribute("href", "/settings");
  await expect(page.getByRole("navigation", { name: "Streaming service" })).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]providers=/);

  await page.getByRole("navigation", { name: "Pagination" }).getByRole("link", { name: /Next/ }).click();
  await expect(page).toHaveURL(/[?&]page=2(&|$)/);
  await expect(page).not.toHaveURL(/[?&]providers=/);
  await expect(streamingOn).toContainText(name);

  await page.getByRole("navigation", { name: "Genre" }).getByRole("link", { name: "Drama" }).click();
  await expect(page).toHaveURL(/[?&]genre=\d+(&|$)/);
  await expect(page).not.toHaveURL(/[?&]providers=/);
  await expect(streamingOn).toContainText(name);

  await page.goto("/settings");
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();

  await page.goto("/");
  await expect(streamingOn).toHaveText(/^Streaming on: Any service\s+Change$/);
});
