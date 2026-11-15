import { expect, test } from "@playwright/test";

// Only the URL and the selected pill: the preview reads live TMDB data, so which service comes first is not asserted.
test("a service saved in Settings filters home, and a reload keeps it", async ({ page }) => {
  await page.goto("/settings");
  const checkbox = page.getByRole("region", { name: "My services" }).getByRole("checkbox").first();
  // The checkbox is named by its label's text, the service name; the logo beside it is hidden from that name.
  const name = (await checkbox.locator("xpath=ancestor::label").innerText()).trim();
  await checkbox.check();
  await expect(checkbox).toBeChecked();

  await page.goto("/");
  await expect(page).not.toHaveURL(/[?&]providers=/);
  const services = page.getByRole("navigation", { name: "Streaming service" });
  await expect(services.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "true");
  await expect(services.getByRole("link", { name: "Any service" })).not.toHaveAttribute("aria-current");

  await page.reload();
  await expect(services.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "true");
  await expect(services.getByRole("link", { name: "Any service" })).toHaveAttribute("href", "/?providers=any");
});
