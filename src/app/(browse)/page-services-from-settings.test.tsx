import { cleanup, render, screen, within } from "@testing-library/react";
import discover from "@/lib/tmdb/fixtures/discover-movie.json";
import discoverTv from "@/lib/tmdb/fixtures/discover-tv.json";
import genreList from "@/lib/tmdb/fixtures/genre-movie-list.json";
import genreTvList from "@/lib/tmdb/fixtures/genre-tv-list.json";
import watchProviderRegions from "@/lib/tmdb/fixtures/watch-provider-regions.json";
import watchProvidersMovie from "@/lib/tmdb/fixtures/watch-providers-movie.json";
import watchProvidersTv from "@/lib/tmdb/fixtures/watch-providers-tv.json";
import Home from "./page";

// Home with flags `services-from-settings` and `settings-page` on: the services come from Settings only.
// The pills and the `providers` param, with either flag off, are covered in page.test.tsx.

/** A fake TMDB. `bodies` replaces the fixture answered for a path, e.g. `{ "/3/watch/providers/tv": … }`. */
function stubTmdb(bodies: Record<string, unknown> = {}) {
  const fetchMock = vi.fn(async (input: URL | string) => {
    const { pathname } = new URL(String(input));
    if (pathname in bodies) return Response.json(bodies[pathname]);
    if (pathname === "/3/genre/movie/list") return Response.json(genreList);
    if (pathname === "/3/discover/movie") return Response.json(discover);
    if (pathname === "/3/genre/tv/list") return Response.json(genreTvList);
    if (pathname === "/3/discover/tv") return Response.json(discoverTv);
    if (pathname === "/3/watch/providers/regions") return Response.json(watchProviderRegions);
    if (pathname === "/3/watch/providers/movie") return Response.json(watchProvidersMovie);
    if (pathname === "/3/watch/providers/tv") return Response.json(watchProvidersTv);
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The services home asked TMDB's discover to filter by, e.g. "8|337", or null for any service. */
function discoverServices(fetchMock: ReturnType<typeof stubTmdb>, kind = "movie") {
  const call = fetchMock.mock.calls.find(([input]) => String(input).includes(`/discover/${kind}`));
  return new URL(String(call![0])).searchParams.get("with_watch_providers");
}

async function renderHome(params: Record<string, string> = {}) {
  render(await Home({ searchParams: Promise.resolve(params) }));
}

function streamingOnLine() {
  return screen.getByText(/^Streaming on:/);
}

function hrefs() {
  return screen.getAllByRole("link").map((link) => link.getAttribute("href") ?? "");
}

/** The `reelbase-services` cookie the visitor's request carries. */
const request = vi.hoisted(() => ({ servicesCookie: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "reelbase-services" && request.servicesCookie !== undefined ? { name, value: request.servicesCookie } : undefined,
    set: vi.fn(),
  })),
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect ${url}`);
  }),
}));

/** The LaunchDarkly kill switches as this request sees them: on unless a test turns one off. */
const flags = vi.hoisted(() => ({ killSwitches: {} as Record<string, boolean> }));

vi.mock("@/lib/flags/flags", () => ({
  isMarqueeHome: vi.fn(async () => false),
  isFlagOn: vi.fn(async (key: string) => flags.killSwitches[key] ?? true),
}));

beforeEach(() => {
  vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "test-token");
  flags.killSwitches = {};
  request.servicesCookie = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Home page with services from Settings", () => {
  it("filters by the saved services the top 12 lists and names them in TMDB's display order, with no pills", async () => {
    const fetchMock = stubTmdb();
    // 149 (Movistar Plus+) is saved from Spain and not in the US top 12.
    request.servicesCookie = "15,149,337,8";
    await renderHome();
    expect(discoverServices(fetchMock)).toBe("8|15|337");
    expect(streamingOnLine()).toHaveTextContent("Streaming on: Netflix, Disney Plus, Hulu Change");
    expect(within(streamingOnLine()).getByRole("link", { name: "Change" })).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("navigation", { name: "Streaming service" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Any service" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Netflix" })).not.toBeInTheDocument();
    expect(hrefs().filter((href) => href.includes("justwatch"))).toEqual([]);
  });

  it("shows unfiltered results and Any service with no saved services", async () => {
    const fetchMock = stubTmdb();
    await renderHome();
    expect(discoverServices(fetchMock)).toBeNull();
    expect(streamingOnLine()).toHaveTextContent("Streaming on: Any service Change");
  });

  it("shows unfiltered results and Any service when the top 12 lists none of the saved services", async () => {
    const fetchMock = stubTmdb();
    request.servicesCookie = "149";
    await renderHome();
    expect(discoverServices(fetchMock)).toBeNull();
    expect(streamingOnLine()).toHaveTextContent("Streaming on: Any service Change");
  });

  it.each(["9", "any"])("ignores providers=%s and applies the saved services as if it were absent", async (providers) => {
    let fetchMock = stubTmdb();
    request.servicesCookie = "8";
    await renderHome({ providers });
    expect(discoverServices(fetchMock)).toBe("8");
    expect(streamingOnLine()).toHaveTextContent("Streaming on: Netflix Change");
    cleanup();
    fetchMock = stubTmdb();
    request.servicesCookie = undefined;
    await renderHome({ providers });
    expect(discoverServices(fetchMock)).toBeNull();
    expect(streamingOnLine()).toHaveTextContent("Streaming on: Any service Change");
  });

  it("writes no providers param in any home link", async () => {
    stubTmdb();
    request.servicesCookie = "8,337";
    await renderHome({ providers: "9", genre: "28", decade: "2010", rating: "7", runtime: "120", language: "es", sort: "rating" });
    const links = hrefs();
    expect(links.filter((href) => href.includes("providers"))).toEqual([]);
    expect(within(screen.getByRole("navigation", { name: "Pagination" })).getByRole("link", { name: /Next/ })).toHaveAttribute(
      "href",
      "/?genre=28&decade=2010&rating=7&runtime=120&language=es&sort=rating&page=2",
    );
    expect(within(screen.getByRole("navigation", { name: "Movies or TV" })).getByRole("link", { name: "TV" })).toHaveAttribute(
      "href",
      "/?type=tv&decade=2010&rating=7&runtime=120&language=es&sort=rating",
    );
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/?sort=rating");
  });

  it("shows Clear filters only when a filter other than services is set", async () => {
    stubTmdb();
    request.servicesCookie = "8,337";
    await renderHome();
    expect(screen.queryByRole("link", { name: "Clear filters" })).not.toBeInTheDocument();
    cleanup();
    await renderHome({ genre: "28" });
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/");
  });

  it("re-resolves the saved services against the other kind's top 12", async () => {
    // Movies list Netflix and Amazon Prime Video; TV lists them and Crunchyroll (283).
    const movieTop = { results: watchProvidersMovie.results.filter(({ provider_id }) => provider_id === 8 || provider_id === 9) };
    const netflix = watchProvidersTv.results.find(({ provider_id }) => provider_id === 8)!;
    const tvTop = {
      results: [...movieTop.results, { ...netflix, provider_id: 283, provider_name: "Crunchyroll", display_priorities: { US: 2 } }],
    };
    const fetchMock = stubTmdb({ "/3/watch/providers/movie": movieTop, "/3/watch/providers/tv": tvTop });
    request.servicesCookie = "8,283";
    await renderHome();
    expect(discoverServices(fetchMock)).toBe("8");
    expect(streamingOnLine()).toHaveTextContent("Streaming on: Netflix Change");
    cleanup();
    await renderHome({ type: "tv" });
    expect(discoverServices(fetchMock, "tv")).toBe("8|283");
    expect(streamingOnLine()).toHaveTextContent("Streaming on: Netflix, Crunchyroll Change");
  });

  it("re-resolves the saved services against ?region='s top 12", async () => {
    const fetchMock = stubTmdb();
    // Movistar Plus+ (149) is in Spain's top 12, not the US one; Hulu (15) the other way round.
    request.servicesCookie = "15,149";
    await renderHome({ region: "ES" });
    expect(discoverServices(fetchMock)).toBe("149");
    expect(streamingOnLine()).toHaveTextContent("Streaming on: Movistar Plus+ Change");
  });

  it.each(["services-from-settings", "settings-page"])("shows the pills, providers param and credit as before with %s off", async (flag) => {
    flags.killSwitches[flag] = false;
    const fetchMock = stubTmdb();
    await renderHome({ providers: "9" });
    expect(discoverServices(fetchMock)).toBe("9");
    expect(screen.queryByText(/^Streaming on:/)).not.toBeInTheDocument();
    const services = screen.getByRole("navigation", { name: "Streaming service" });
    expect(within(services).getByRole("link", { name: "Amazon Prime Video" })).toHaveAttribute("aria-current", "true");
    expect(within(services).getByRole("link", { name: "Netflix" })).toHaveAttribute("href", "/?providers=8,9");
    expect(screen.getByRole("link", { name: "Streaming data by JustWatch" })).toHaveAttribute("href", "https://www.justwatch.com/");
  });
});
