import { render, screen, within } from "@testing-library/react";
import { STORAGE_KEY } from "@/lib/watchlist/watchlist";
import { SiteHeader } from "./site-header";

beforeEach(() => {
  localStorage.clear();
});

describe("SiteHeader", () => {
  it("renders a banner with navigation to home and the watchlist", () => {
    render(<SiteHeader />);
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
    render(<SiteHeader />);
    const nav = within(screen.getByRole("banner")).getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Watchlist (2 saved)" })).toHaveAttribute("href", "/watchlist");
  });
});

describe("SiteHeader search", () => {
  it("includes the search box", () => {
    render(<SiteHeader />);
    expect(within(screen.getByRole("banner")).getByRole("search")).toBeInTheDocument();
  });
});

describe("SiteHeader theme", () => {
  it("includes the theme toggle", () => {
    render(<SiteHeader />);
    expect(within(screen.getByRole("banner")).getByRole("group", { name: "Theme" })).toBeInTheDocument();
  });
});

describe("SiteHeader view transition", () => {
  it("is named so it stays still while main crossfades", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("banner").style.viewTransitionName).toBe("site-header");
  });
});
