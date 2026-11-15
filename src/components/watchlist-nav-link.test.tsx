import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { STORAGE_KEY, type WatchlistEntry } from "@/lib/watchlist/watchlist";
import { WatchlistButton } from "./watchlist-button";
import { WatchlistNavLink } from "./watchlist-nav-link";

function movies(count: number): WatchlistEntry[] {
  return Array.from({ length: count }, (_, i) => ({ kind: "movie", id: i + 1, slug: `movie-${i + 1}`, name: `Movie ${i + 1}` }));
}

const SHOW: WatchlistEntry = { kind: "tv", id: 1, slug: "show-1", name: "Show 1" };

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WatchlistNavLink", () => {
  it("links to the watchlist with no pill when nothing is saved", () => {
    render(<WatchlistNavLink />);
    const link = screen.getByRole("link", { name: "Watchlist" });
    expect(link).toHaveAttribute("href", "/watchlist");
    expect(link).toHaveTextContent(/^Watchlist$/);
    expect(screen.queryByTestId("watchlist-count")).not.toBeInTheDocument();
  });

  it.each([1, 3, 99])("shows %i in the pill and the exact count in the name", (count) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(movies(count)));
    render(<WatchlistNavLink />);
    const link = screen.getByRole("link", { name: `Watchlist (${count} saved)` });
    const pill = screen.getByTestId("watchlist-count");
    expect(pill).toHaveTextContent(new RegExp(`^${count}$`));
    expect(pill).toHaveAttribute("aria-hidden", "true");
    expect(link).toContainElement(pill);
  });

  it.each([100, 120])("caps the pill at 99+ with %i saved but names the exact count", (count) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(movies(count)));
    render(<WatchlistNavLink />);
    expect(screen.getByRole("link", { name: `Watchlist (${count} saved)` })).toBeInTheDocument();
    expect(screen.getByTestId("watchlist-count")).toHaveTextContent(/^99\+$/);
  });

  it("counts saved movies and shows together", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...movies(2), SHOW]));
    render(<WatchlistNavLink />);
    expect(screen.getByRole("link", { name: "Watchlist (3 saved)" })).toBeInTheDocument();
  });

  it("does not count entries the store rejects as invalid", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...movies(1), { kind: "person", id: 9, slug: "x", name: "X" }]));
    render(<WatchlistNavLink />);
    expect(screen.getByRole("link", { name: "Watchlist (1 saved)" })).toBeInTheDocument();
  });

  it("updates without a reload when titles are saved and removed through the store", async () => {
    const user = userEvent.setup();
    const [first, second] = movies(2);
    render(
      <>
        <WatchlistButton entry={first} />
        <WatchlistButton entry={second} />
        <WatchlistNavLink />
      </>,
    );
    const [saveFirst, saveSecond] = screen.getAllByRole("button", { name: "Save to watchlist" });

    await user.click(saveFirst);
    expect(screen.getByRole("link", { name: "Watchlist (1 saved)" })).toBeInTheDocument();
    expect(screen.getByTestId("watchlist-count")).toHaveTextContent(/^1$/);

    await user.click(saveSecond);
    expect(screen.getByTestId("watchlist-count")).toHaveTextContent(/^2$/);

    await user.click(saveFirst);
    await user.click(saveSecond);
    expect(screen.getByRole("link", { name: "Watchlist" })).toBeInTheDocument();
    expect(screen.queryByTestId("watchlist-count")).not.toBeInTheDocument();
  });

  it("updates when another tab changes the watchlist", () => {
    render(<WatchlistNavLink />);
    act(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(movies(3)));
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    });
    expect(screen.getByRole("link", { name: "Watchlist (3 saved)" })).toBeInTheDocument();
    expect(screen.getByTestId("watchlist-count")).toHaveTextContent(/^3$/);
  });

  it("renders no pill on the server, even with titles saved", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(movies(3)));
    const html = renderToString(<WatchlistNavLink />);
    expect(html).toContain('href="/watchlist"');
    expect(html).not.toContain("watchlist-count");
    expect(html).not.toContain("saved");
  });

  it("renders no pill and does not throw when storage is blocked", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(movies(3)));
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    render(<WatchlistNavLink />);
    expect(screen.getByRole("link", { name: "Watchlist" })).toBeInTheDocument();
    expect(screen.queryByTestId("watchlist-count")).not.toBeInTheDocument();
  });
});
