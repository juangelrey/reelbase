import { render, screen, within } from "@testing-library/react";
import { RuntimeFilter } from "./runtime-filter";
import type { BrowseState } from "@/lib/catalog/browse-params";

const BASE: BrowseState = { kind: "movie", genres: [], sort: "popularity", page: 1, region: "US", regionFromUrl: false, providers: [] };

function renderFilter(state: Partial<BrowseState> = {}) {
  render(<RuntimeFilter state={{ ...BASE, ...state }} />);
  return screen.getByRole("navigation", { name: "Runtime" });
}

const current = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "true")
    .map((link) => link.textContent);

describe("RuntimeFilter", () => {
  it("shows Any, then Under 90, 120 and 150 min", () => {
    const names = within(renderFilter()).getAllByRole("link").map((link) => link.textContent);
    expect(names).toEqual(["Any", "Under 90 min", "Under 120 min", "Under 150 min"]);
  });

  it("marks only Any current when no runtime is set", () => {
    expect(current(renderFilter())).toEqual(["Any"]);
  });

  it("marks only the selected runtime current", () => {
    expect(current(renderFilter({ runtime: 120 }))).toEqual(["Under 120 min"]);
  });

  it("links each runtime to page 1, keeping every other filter", () => {
    const nav = renderFilter({ kind: "tv", genres: [18], sort: "rating", page: 3, providers: [8], decade: 2010, rating: 7, region: "ES", regionFromUrl: true });
    const hrefs = within(nav).getAllByRole("link").slice(1).map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(
      [90, 120, 150].map((runtime) => `/?type=tv&genre=18&providers=8&decade=2010&rating=7&runtime=${runtime}&region=ES&sort=rating`),
    );
  });

  it("keeps the selected runtime on its own pill, so clicking it does not clear it", () => {
    expect(within(renderFilter({ runtime: 150, page: 2 })).getByRole("link", { name: "Under 150 min" })).toHaveAttribute("href", "/?runtime=150");
  });

  it("drops the runtime and the page with Any, keeping the other filters", () => {
    const nav = renderFilter({ runtime: 90, decade: 1990, rating: 8, sort: "release", page: 4 });
    expect(within(nav).getByRole("link", { name: "Any" })).toHaveAttribute("href", "/?decade=1990&rating=8&sort=release");
  });
});
