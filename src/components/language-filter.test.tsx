import { render, screen, within } from "@testing-library/react";
import { LanguageFilter } from "./language-filter";
import type { BrowseState } from "@/lib/catalog/browse-params";

const BASE: BrowseState = { kind: "movie", genres: [], sort: "popularity", page: 1, region: "US", regionFromUrl: false, providers: [] };

function renderFilter(state: Partial<BrowseState> = {}) {
  render(<LanguageFilter state={{ ...BASE, ...state }} />);
  return screen.getByRole("navigation", { name: "Language" });
}

const current = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "true")
    .map((link) => link.textContent);

describe("LanguageFilter", () => {
  it("shows Any, then English, Spanish, French, Japanese and Korean", () => {
    const names = within(renderFilter()).getAllByRole("link").map((link) => link.textContent);
    expect(names).toEqual(["Any", "English", "Spanish", "French", "Japanese", "Korean"]);
  });

  it("marks only Any current when no language is set", () => {
    expect(current(renderFilter())).toEqual(["Any"]);
  });

  it("marks only the selected language current", () => {
    expect(current(renderFilter({ language: "es" }))).toEqual(["Spanish"]);
  });

  it("links each language to page 1, keeping every other filter", () => {
    const nav = renderFilter({ kind: "tv", genres: [18], sort: "rating", page: 3, providers: [8], decade: 2010, rating: 7, runtime: 120, region: "ES", regionFromUrl: true });
    const hrefs = within(nav).getAllByRole("link").slice(1).map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(
      ["en", "es", "fr", "ja", "ko"].map((language) => `/?type=tv&genre=18&providers=8&decade=2010&rating=7&runtime=120&language=${language}&region=ES&sort=rating`),
    );
  });

  it("keeps the selected language on its own pill, so clicking it does not clear it", () => {
    expect(within(renderFilter({ language: "ja", page: 2 })).getByRole("link", { name: "Japanese" })).toHaveAttribute("href", "/?language=ja");
  });

  it("drops the language and the page with Any, keeping the other filters", () => {
    const nav = renderFilter({ language: "ko", decade: 1990, rating: 8, runtime: 90, sort: "release", page: 4 });
    expect(within(nav).getByRole("link", { name: "Any" })).toHaveAttribute("href", "/?decade=1990&rating=8&runtime=90&sort=release");
  });
});
