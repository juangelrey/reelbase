import providersMovie from "@/lib/tmdb/fixtures/watch-providers-movie.json";
import providersTv from "@/lib/tmdb/fixtures/watch-providers-tv.json";
import { LOGO_SIZE, PROVIDER_LIMIT, STORE_PROVIDER_IDS, listProviders, listStreamingServices } from "./providers";

function stubFetch(body: unknown) {
  const fetchMock = vi.fn(async () => Response.json(body));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestedUrl(fetchMock: { mock: { calls: unknown[][] } }) {
  return new URL(String(fetchMock.mock.calls[0][0]));
}

beforeEach(() => {
  vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "test-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("listProviders", () => {
  it("requests the kind's provider list for the region, in one request", async () => {
    const fetchMock = stubFetch(providersTv);
    await listProviders("tv", "ES");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = requestedUrl(fetchMock);
    expect(url.pathname).toBe("/3/watch/providers/tv");
    expect(url.searchParams.get("watch_region")).toBe("ES");
  });

  it("returns the region's top 12 in TMDB's display order, Netflix first for US", async () => {
    stubFetch(providersMovie);
    const providers = await listProviders("movie", "US");
    expect(PROVIDER_LIMIT).toBe(12);
    expect(providers).toHaveLength(12);
    expect(providers.map((p) => p.id)).toEqual([8, 9, 350, 337, 15, 2285, 257, 1899, 386, 531, 300, 73]);
    expect(providers[0]).toMatchObject({ id: 8, name: "Netflix" });
  });

  it("orders TV providers by the region's priority too", async () => {
    stubFetch(providersTv);
    const providers = await listProviders("tv", "US");
    expect(providers).toHaveLength(12);
    expect(providers.map((p) => p.id)).toEqual([8, 9, 350, 337, 15, 1899, 2285, 386, 531, 257, 300, 73]);
  });

  it("never lists rent/buy stores, and backfills to 12 past them", async () => {
    for (const id of [2, 3, 10, 2784]) expect(STORE_PROVIDER_IDS.has(id)).toBe(true);
    for (const [kind, fixture] of [["movie", providersMovie], ["tv", providersTv]] as const) {
      stubFetch(fixture);
      const ids = (await listProviders(kind, "US")).map((p) => p.id);
      expect(ids).toHaveLength(12);
      for (const id of ids) expect(STORE_PROVIDER_IDS.has(id)).toBe(false);
    }
  });

  it("keeps free and ad-supported services such as JustWatch TV Free", async () => {
    stubFetch(providersMovie);
    const ids = (await listProviders("movie", "US")).map((p) => p.id);
    expect(ids).toContain(2285);
  });

  it("leaves out providers with no priority for the region", async () => {
    stubFetch(providersMovie);
    const us = (await listProviders("movie", "US")).map((p) => p.id);
    expect(us).not.toContain(149);

    stubFetch(providersMovie);
    const es = await listProviders("movie", "ES");
    expect(es.map((p) => p.id)).toEqual([8, 9, 350, 149, 337, 300]);
  });

  it("builds logo URLs on image.tmdb.org at one fixed size", async () => {
    stubFetch(providersMovie);
    const [netflix] = await listProviders("movie", "US");
    expect(netflix.logoUrl).toBe(`https://image.tmdb.org/t/p/${LOGO_SIZE}/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg`);
    expect(LOGO_SIZE).toBe("w92");
  });

  it("leaves logoUrl undefined when TMDB has no logo", async () => {
    stubFetch({ results: [{ provider_id: 8, provider_name: "Netflix", logo_path: null, display_priorities: { US: 0 } }] });
    expect(await listProviders("movie", "US")).toEqual([{ id: 8, name: "Netflix", logoUrl: undefined }]);
  });
});

/** A watch-provider list of TMDB shape where every id streams in US, in the order given. */
function providerList(ids: number[]) {
  return { results: ids.map((id, index) => ({ provider_id: id, provider_name: `Service ${id}`, logo_path: null, display_priorities: { US: index } })) };
}

describe("listStreamingServices", () => {
  function stubKinds(bodies: { movie: unknown; tv: unknown }) {
    const fetchMock = vi.fn(async (input: URL | string) =>
      Response.json(new URL(String(input)).pathname === "/3/watch/providers/movie" ? bodies.movie : bodies.tv),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("lists the movie top 12, then the TV top 12 not already listed, each once", async () => {
    // Ids clear of STORE_PROVIDER_IDS; each list is one longer than the top 12, so the 13th is cut.
    const movie = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113];
    const tv = [120, 102, 121, 101, 122, 123, 124, 125, 126, 127, 128, 129, 130];
    const fetchMock = stubKinds({ movie: providerList(movie), tv: providerList(tv) });
    const ids = (await listStreamingServices("US")).map((p) => p.id);
    expect(ids).toEqual([...movie.slice(0, 12), 120, 121, 122, 123, 124, 125, 126, 127, 128, 129]);
    const paths = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    expect(paths.map((url) => url.pathname).sort()).toEqual(["/3/watch/providers/movie", "/3/watch/providers/tv"]);
    for (const url of paths) expect(url.searchParams.get("watch_region")).toBe("US");
  });

  it("leaves out rent/buy stores, as the home filter does", async () => {
    stubKinds({ movie: providersMovie, tv: providersTv });
    const ids = (await listStreamingServices("US")).map((p) => p.id);
    expect(ids).toEqual([8, 9, 350, 337, 15, 2285, 257, 1899, 386, 531, 300, 73]);
    for (const id of ids) expect(STORE_PROVIDER_IDS.has(id)).toBe(false);
  });

  it("is empty for a region that lists no services", async () => {
    stubKinds({ movie: providersMovie, tv: providersTv });
    expect(await listStreamingServices("FR")).toEqual([]);
  });
});
