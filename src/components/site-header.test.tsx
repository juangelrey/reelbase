import { render, screen, within } from "@testing-library/react";
import { STORAGE_KEY } from "@/lib/watchlist/watchlist";
import { SiteHeader } from "./site-header";

beforeEach(() => {
  localStorage.clear();
});

describe("SiteHeader", () => {
  it("renders a banner with navigation to home and the watchlist", () => {
    render(<SiteHeader settingsPage={false} />);
    const banner = screen.getByRole("banner");
    const nav = within(banner).getByRole("navigation", { name: "Main" });
    expect(within(banner).getByRole("link", { name: "Reelbase" })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: "Watchlist" })).toHaveAttribute("href", "/watchlist");
  });
});

describe("SiteHeader watchlist count", () => {
  it("shows the saved count on the watchlist link", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { kind: "movie", id: 603, slug: "the-matrix", name: "The Matrix" },
        { kind: "tv", id: 1396, slug: "breaking-bad", name: "Breaking Bad" },
      ]),
    );
    render(<SiteHeader settingsPage={false} />);
    const nav = within(screen.getByRole("banner")).getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Watchlist (2 saved)" })).toHaveAttribute("href", "/watchlist");
  });
});

describe("SiteHeader search", () => {
  it("includes the search box", () => {
    render(<SiteHeader settingsPage={false} />);
    expect(within(screen.getByRole("banner")).getByRole("search")).toBeInTheDocument();
  });
});

describe("SiteHeader theme and settings (flag settings-page)", () => {
  it("includes the theme toggle and no Settings link when the flag is off", () => {
    render(<SiteHeader settingsPage={false} />);
    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("group", { name: "Theme" })).toBeInTheDocument();
    expect(within(banner).queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("links a gear icon named Settings to /settings in place of the theme toggle when the flag is on", () => {
    render(<SiteHeader settingsPage />);
    const banner = screen.getByRole("banner");
    const settings = within(banner).getByRole("link", { name: "Settings" });
    expect(settings).toHaveAttribute("href", "/settings");
    expect(settings.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(within(banner).queryByRole("group", { name: "Theme" })).not.toBeInTheDocument();
  });
});

describe("SiteHeader view transition", () => {
  it("is named so it stays still while main crossfades", () => {
    render(<SiteHeader settingsPage={false} />);
    expect(screen.getByRole("banner").style.viewTransitionName).toBe("site-header");
  });
});
