import { render, screen, within } from "@testing-library/react";
import { BrowseControls } from "./browse-controls";
import { clearFiltersHref, type BrowseState } from "@/lib/catalog/browse-params";

const GENRES = [
  { id: 28, name: "Action" },
  { id: 35, name: "Comedy" },
  { id: 18, name: "Drama" },
];

function renderControls(state: Partial<BrowseState> = {}) {
  render(<BrowseControls genres={GENRES} state={{ kind: "movie", genres: [], sort: "popularity", page: 1, region: "US", regionFromUrl: false, providers: [], ...state }} />);
  return screen.getByRole("navigation", { name: "Genre" });
}

describe("BrowseControls genre pills", () => {
  it("marks every selected genre current and nothing else", () => {
    const nav = renderControls({ genres: [28, 35] });
    expect(within(nav).getByRole("link", { name: "Action" })).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("link", { name: "Comedy" })).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("link", { name: "Drama" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "All" })).not.toHaveAttribute("aria-current");
  });

  it("removes a selected genre from the selection", () => {
    const nav = renderControls({ genres: [28, 35] });
    expect(within(nav).getByRole("link", { name: "Action" })).toHaveAttribute("href", "/?genre=35");
    expect(within(nav).getByRole("link", { name: "Comedy" })).toHaveAttribute("href", "/?genre=28");
  });

  it("adds an unselected genre in ascending order", () => {
    const nav = renderControls({ genres: [28, 35] });
    expect(within(nav).getByRole("link", { name: "Drama" })).toHaveAttribute("href", "/?genre=18,28,35");
  });

  it("links the last selected genre back to all genres", () => {
    const nav = renderControls({ genres: [28] });
    expect(within(nav).getByRole("link", { name: "Action" })).toHaveAttribute("href", "/");
  });

  it("clears every genre with All", () => {
    expect(within(renderControls({ genres: [28, 35] })).getByRole("link", { name: "All" })).toHaveAttribute("href", "/");
  });

  it("marks All current when no genre is selected", () => {
    expect(within(renderControls()).getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "true");
  });

  it("drops the page and keeps sort and type on every pill", () => {
    const nav = renderControls({ kind: "tv", genres: [28, 35], sort: "rating", page: 3 });
    const hrefs = within(nav).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual([
      "/?type=tv&sort=rating",
      "/?type=tv&genre=35&sort=rating",
      "/?type=tv&genre=28&sort=rating",
      "/?type=tv&genre=18,28,35&sort=rating",
    ]);
  });

  it("keeps a region that came from the URL on the genre pills", () => {
    const explicit = renderControls({ genres: [28], region: "ES", regionFromUrl: true });
    expect(within(explicit).getByRole("link", { name: "All" })).toHaveAttribute("href", "/?region=ES");
    expect(within(explicit).getByRole("link", { name: "Comedy" })).toHaveAttribute("href", "/?genre=28,35&region=ES");
  });
});

describe("BrowseControls decade pills", () => {
  it("shows the decade row in the filter bar, with the selected decade current", () => {
    renderControls({ decade: 2010 });
    const nav = screen.getByRole("navigation", { name: "Decade" });
    expect(within(nav).getByRole("link", { name: "2010s" })).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("link", { name: "All" })).not.toHaveAttribute("aria-current");
  });
});

describe("BrowseControls rating pills", () => {
  it("shows the rating row under the decade row, with the selected rating current", () => {
    renderControls({ rating: 7 });
    const decades = screen.getByRole("navigation", { name: "Decade" });
    const nav = screen.getByRole("navigation", { name: "Rating" });
    expect(decades.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "7+" })).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("link", { name: "Any" })).not.toHaveAttribute("aria-current");
  });
});

describe("BrowseControls clear filters link", () => {
  it("shows one link to clear a selected genre", () => {
    renderControls({ genres: [28] });
    expect(screen.getAllByRole("link", { name: "Clear filters" })).toHaveLength(1);
  });

  it("shows one link to clear a selected service", () => {
    renderControls({ providers: [8] });
    expect(screen.getAllByRole("link", { name: "Clear filters" })).toHaveLength(1);
  });

  it("shows one link to clear a selected decade", () => {
    renderControls({ decade: 2010 });
    expect(screen.getAllByRole("link", { name: "Clear filters" })).toHaveLength(1);
  });

  it("shows one link to clear a selected rating alone, without the rating in its href", () => {
    renderControls({ rating: 8 });
    const links = screen.getAllByRole("link", { name: "Clear filters" });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/");
  });

  it("is not shown without a genre, service, decade or rating", () => {
    renderControls({ kind: "tv", sort: "rating", region: "ES", regionFromUrl: true, page: 2 });
    expect(screen.queryByRole("link", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("is a plain link to the cleared state, never marked current", () => {
    const state: BrowseState = { kind: "tv", genres: [18], providers: [8], decade: 2010, region: "ES", regionFromUrl: true, sort: "rating", page: 3 };
    renderControls(state);
    const link = screen.getByRole("link", { name: "Clear filters" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", clearFiltersHref(state));
    expect(link).toHaveAttribute("href", "/?type=tv&region=ES&sort=rating");
    expect(link).not.toHaveAttribute("aria-current");
  });
});
