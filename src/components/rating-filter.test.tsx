import { render, screen, within } from "@testing-library/react";
import { RatingFilter } from "./rating-filter";
import type { BrowseState } from "@/lib/catalog/browse-params";

const BASE: BrowseState = { kind: "movie", genres: [], sort: "popularity", page: 1, region: "US", regionFromUrl: false, providers: [] };

function renderFilter(state: Partial<BrowseState> = {}) {
  render(<RatingFilter state={{ ...BASE, ...state }} />);
  return screen.getByRole("navigation", { name: "Rating" });
}

const current = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "true")
    .map((link) => link.textContent);

describe("RatingFilter", () => {
  it("shows Any, then 6+, 7+ and 8+", () => {
    const names = within(renderFilter()).getAllByRole("link").map((link) => link.textContent);
    expect(names).toEqual(["Any", "6+", "7+", "8+"]);
  });

  it("marks only Any current when no rating is set", () => {
    expect(current(renderFilter())).toEqual(["Any"]);
  });

  it("marks only the selected rating current", () => {
    expect(current(renderFilter({ rating: 7 }))).toEqual(["7+"]);
  });

  it("links each rating to page 1, keeping every other filter", () => {
    const nav = renderFilter({ kind: "tv", genres: [18], sort: "rating", page: 3, providers: [8], decade: 2010, region: "ES", regionFromUrl: true });
    const hrefs = within(nav).getAllByRole("link").slice(1).map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(
      [6, 7, 8].map((rating) => `/?type=tv&genre=18&providers=8&decade=2010&rating=${rating}&region=ES&sort=rating`),
    );
  });

  it("keeps the selected rating on its own pill, so clicking it does not clear it", () => {
    expect(within(renderFilter({ rating: 8, page: 2 })).getByRole("link", { name: "8+" })).toHaveAttribute("href", "/?rating=8");
  });

  it("drops the rating and the page with Any, keeping the other filters", () => {
    const nav = renderFilter({ rating: 6, decade: 1990, sort: "release", page: 4 });
    expect(within(nav).getByRole("link", { name: "Any" })).toHaveAttribute("href", "/?decade=1990&sort=release");
  });
});
