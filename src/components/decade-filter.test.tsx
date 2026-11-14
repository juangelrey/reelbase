import { render, screen, within } from "@testing-library/react";
import { DecadeFilter } from "./decade-filter";
import type { BrowseState } from "@/lib/catalog/browse-params";

const BASE: BrowseState = { kind: "movie", genres: [], sort: "popularity", page: 1, region: "US", regionFromUrl: false, providers: [] };

function renderFilter(state: Partial<BrowseState> = {}) {
  render(<DecadeFilter state={{ ...BASE, ...state }} />);
  return screen.getByRole("navigation", { name: "Decade" });
}

const current = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "true")
    .map((link) => link.textContent);

describe("DecadeFilter", () => {
  it("shows All, then the decades newest first", () => {
    const names = within(renderFilter()).getAllByRole("link").map((link) => link.textContent);
    expect(names).toEqual(["All", "2020s", "2010s", "2000s", "1990s", "1980s", "1970s"]);
  });

  it("marks only All current when no decade is set", () => {
    expect(current(renderFilter())).toEqual(["All"]);
  });

  it("marks only the selected decade current", () => {
    expect(current(renderFilter({ decade: 2010 }))).toEqual(["2010s"]);
  });

  it("links each decade to page 1 with its first year, keeping every other filter", () => {
    const nav = renderFilter({ kind: "tv", genres: [18], sort: "rating", page: 3, providers: [8], region: "ES", regionFromUrl: true });
    const hrefs = within(nav).getAllByRole("link").slice(1).map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(
      [2020, 2010, 2000, 1990, 1980, 1970].map(
        (year) => `/?type=tv&genre=18&providers=8&decade=${year}&region=ES&sort=rating`,
      ),
    );
  });

  it("keeps the selected decade on its own pill, so clicking it does not clear it", () => {
    expect(within(renderFilter({ decade: 2010, page: 2 })).getByRole("link", { name: "2010s" })).toHaveAttribute("href", "/?decade=2010");
  });

  it("drops the decade and the page with All", () => {
    const nav = renderFilter({ decade: 1990, sort: "rating", page: 4 });
    expect(within(nav).getByRole("link", { name: "All" })).toHaveAttribute("href", "/?sort=rating");
  });
});
