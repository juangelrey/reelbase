import {
  DECADES,
  DEFAULT_SORT,
  LANGUAGES,
  LANGUAGE_NAMES,
  RATINGS,
  RUNTIMES,
  browseHref,
  clearFiltersHref,
  hasFilters,
  parseBrowseParams,
  parseKind,
  parsePage,
  toggleId,
} from "./browse-params";

const known = new Set([28, 878, 18]);

describe("parseBrowseParams", () => {
  it("defaults to all genres, popularity and page 1", () => {
    expect(DEFAULT_SORT).toBe("popularity");
    expect(parseBrowseParams({}, known, "US")).toEqual({ kind: "movie", genres: [], sort: "popularity", page: 1, region: "US", regionFromUrl: false, providers: [] });
  });

  it("reads a known genre id, sort key and page", () => {
    expect(parseBrowseParams({ genre: "878", sort: "rating", page: "3" }, known, "US")).toEqual({
      kind: "movie",
      genres: [878],
      sort: "rating",
      page: 3,
      region: "US",
      regionFromUrl: false, providers: [],
    });
  });

  it.each(["release", "title", "popularity"])("accepts the %s sort", (sort) => {
    expect(parseBrowseParams({ sort }, known, "US").sort).toBe(sort);
  });

  it.each(["abc", "99999", "-28", "28.5", ""])("falls back to all genres for genre=%j", (genre) => {
    expect(parseBrowseParams({ genre }, known, "US").genres).toEqual([]);
  });

  it("reads several genres sorted, dropping unknown and duplicate ids", () => {
    const genres = new Set([28, 35, 99]);
    expect(parseBrowseParams({ genre: "35,28,35,99999" }, genres, "US").genres).toEqual([28, 35]);
    expect(parseBrowseParams({ genre: "99,abc,,28" }, genres, "US").genres).toEqual([28, 99]);
    expect(parseBrowseParams({ genre: "1e2,0x1c,28.0" }, genres, "US").genres).toEqual([]);
  });

  it("ignores old seed-era sort keys", () => {
    expect(parseBrowseParams({ sort: "year" }, known, "US").sort).toBe("popularity");
    expect(parseBrowseParams({ sort: "name" }, known, "US").sort).toBe("popularity");
  });

  it("reads type=tv and keeps a genre from the TV list", () => {
    const tvGenres = new Set([10765, 18]);
    expect(parseBrowseParams({ type: "tv", genre: "10765", sort: "release" }, tvGenres, "US")).toEqual({
      kind: "tv",
      genres: [10765],
      sort: "release",
      page: 1,
      region: "US",
      regionFromUrl: false, providers: [],
    });
  });

  it("drops a genre id from the other kind's list", () => {
    const tvGenres = new Set([10765, 18]);
    // 878 is the movie Science Fiction id; TV uses 10765 (Sci-Fi & Fantasy).
    expect(parseBrowseParams({ type: "tv", genre: "878" }, tvGenres, "US").genres).toEqual([]);
    expect(parseBrowseParams({ genre: "10765" }, known, "US").genres).toEqual([]);
  });

  it("reads links without type, or with an unknown type, as movies", () => {
    expect(parseBrowseParams({ genre: "878" }, known, "US").kind).toBe("movie");
    expect(parseBrowseParams({ type: "series" }, known, "US").kind).toBe("movie");
  });

  it("uses the first value when a param repeats", () => {
    expect(parseBrowseParams({ genre: ["18", "28"], sort: ["title", "rating"], page: ["2", "9"] }, known, "US")).toEqual({
      kind: "movie",
      genres: [18],
      sort: "title",
      page: 2,
      region: "US",
      regionFromUrl: false, providers: [],
    });
  });
});

describe("parseBrowseParams region", () => {
  it("applies the resolved region and marks it from the URL when ?region= names it", () => {
    expect(parseBrowseParams({ region: "ES" }, known, "ES")).toMatchObject({ region: "ES", regionFromUrl: true, providers: [] });
    expect(parseBrowseParams({ region: ["ES", "GB"] }, known, "ES")).toMatchObject({ region: "ES", regionFromUrl: true, providers: [] });
  });

  it("does not mark a cookie or language default as from the URL", () => {
    expect(parseBrowseParams({}, known, "GB")).toMatchObject({ region: "GB", regionFromUrl: false, providers: [] });
  });

  it("does not mark a ?region= that lost to another rule as from the URL", () => {
    // An unlisted or malformed code falls through, so it must not ride along in links.
    expect(parseBrowseParams({ region: "ZZ" }, known, "GB")).toMatchObject({ region: "GB", regionFromUrl: false, providers: [] });
    expect(parseBrowseParams({ region: "es" }, known, "US")).toMatchObject({ region: "US", regionFromUrl: false, providers: [] });
  });
});

describe("parsePage", () => {
  it.each([
    [undefined, 1],
    ["1", 1],
    ["500", 500],
    ["501", 1],
    ["9999", 1],
    ["0", 1],
    ["-2", 1],
    ["2.5", 1],
    ["abc", 1],
    ["07", 1],
  ])("reads %j as page %i", (value, page) => {
    expect(parsePage(value)).toBe(page);
  });
});

describe("browseHref", () => {
  it("links to the bare home page for the defaults", () => {
    expect(browseHref({ kind: "movie", genres: [], sort: "popularity", page: 1, region: "US", regionFromUrl: false, providers: [] })).toBe("/");
  });

  it("includes the genre, a non-default sort and a page after the first", () => {
    expect(browseHref({ kind: "movie", genres: [878], sort: "title", page: 4, region: "US", regionFromUrl: false, providers: [] })).toBe("/?genre=878&sort=title&page=4");
  });

  it("omits defaults", () => {
    expect(browseHref({ kind: "movie", genres: [18], sort: "popularity", page: 1, region: "US", regionFromUrl: false, providers: [] })).toBe("/?genre=18");
  });

  it("writes several genres ascending and comma-joined", () => {
    expect(browseHref({ kind: "movie", genres: [28, 35], sort: "popularity", page: 1, region: "US", regionFromUrl: false, providers: [] })).toBe("/?genre=28,35");
    expect(browseHref({ kind: "tv", genres: [18, 10765], sort: "rating", page: 2, region: "US", regionFromUrl: false, providers: [] })).toBe("/?type=tv&genre=18,10765&sort=rating&page=2");
  });

  it("round-trips several genres", () => {
    const state = { kind: "movie" as const, genres: [28, 35], sort: "title" as const, page: 2, region: "US", regionFromUrl: false, providers: [] };
    const query = Object.fromEntries(new URLSearchParams(browseHref(state).slice(2)));
    expect(parseBrowseParams(query, new Set([28, 35]), "US")).toEqual(state);
  });

  it("sets type=tv first for TV and leaves it off for movies", () => {
    expect(browseHref({ kind: "tv", genres: [], sort: "popularity", page: 1, region: "US", regionFromUrl: false, providers: [] })).toBe("/?type=tv");
    expect(browseHref({ kind: "tv", genres: [10765], sort: "release", page: 2, region: "US", regionFromUrl: false, providers: [] })).toBe("/?type=tv&genre=10765&sort=release&page=2");
  });

  it("round-trips through parseBrowseParams", () => {
    const state = { kind: "movie" as const, genres: [28], sort: "release" as const, page: 7, region: "US", regionFromUrl: false, providers: [] };
    const query = Object.fromEntries(new URLSearchParams(browseHref(state).slice(2)));
    expect(parseBrowseParams(query, known, "US")).toEqual(state);
  });

  it("round-trips a TV state", () => {
    const state = { kind: "tv" as const, genres: [18], sort: "title" as const, page: 3, region: "US", regionFromUrl: false, providers: [] };
    const query = Object.fromEntries(new URLSearchParams(browseHref(state).slice(2)));
    expect(parseBrowseParams(query, new Set([18]), "US")).toEqual(state);
  });
});

describe("browseHref region", () => {
  const base = { kind: "movie" as const, genres: [28, 35], sort: "rating" as const, page: 2 };

  it("keeps a region that came from the URL", () => {
    expect(browseHref({ ...base, region: "ES", regionFromUrl: true, providers: [] })).toBe("/?genre=28,35&region=ES&sort=rating&page=2");
    expect(browseHref({ kind: "tv", genres: [], sort: "popularity", page: 1, region: "US", regionFromUrl: true, providers: [] })).toBe(
      "/?type=tv&region=US",
    );
  });

  it("leaves out a region from the cookie or browser language", () => {
    expect(browseHref({ ...base, region: "GB", regionFromUrl: false, providers: [] })).toBe("/?genre=28,35&sort=rating&page=2");
  });

  it("round-trips an explicit region", () => {
    const state = { ...base, region: "ES", regionFromUrl: true, providers: [] };
    const query = Object.fromEntries(new URLSearchParams(browseHref(state).slice(2)));
    expect(parseBrowseParams(query, new Set([28, 35]), "ES")).toEqual(state);
  });
});

describe("parseKind", () => {
  it("reads tv and defaults anything else to movie", () => {
    expect(parseKind("tv")).toBe("tv");
    expect(parseKind("movie")).toBe("movie");
    expect(parseKind(undefined)).toBe("movie");
    expect(parseKind("series")).toBe("movie");
    expect(parseKind(["tv", "movie"])).toBe("tv");
  });
});

describe("parseBrowseParams providers", () => {
  // Some of the US top 12 for movies: Netflix, Amazon Prime Video, Disney Plus, Hulu.
  const listed = new Set([8, 9, 337, 15]);

  it("reads listed provider ids ascending, each once", () => {
    expect(parseBrowseParams({ providers: "337,8,337" }, known, "US", listed).providers).toEqual([8, 337]);
    expect(parseBrowseParams({ providers: ["15", "8"] }, known, "US", listed).providers).toEqual([15]);
  });

  it("drops ids the region's top 12 does not list, and malformed ones", () => {
    expect(parseBrowseParams({ providers: "8,149,abc,,1e1,-9,9" }, known, "US", listed).providers).toEqual([8, 9]);
  });

  it("is empty with no param, or with no provider list", () => {
    expect(parseBrowseParams({}, known, "US", listed).providers).toEqual([]);
    expect(parseBrowseParams({ providers: "8" }, known, "US").providers).toEqual([]);
  });

  it("keeps only the services a new region's top 12 lists", () => {
    // Hulu (15) streams in the US but is not among Spain's services.
    const spain = new Set([8, 9, 350, 149, 337, 300]);
    expect(parseBrowseParams({ providers: "8,15,337", region: "ES" }, known, "ES", spain).providers).toEqual([8, 337]);
  });

  it("combines with genres and sort", () => {
    expect(parseBrowseParams({ genre: "28", providers: "8,9", sort: "rating", page: "3" }, known, "US", listed)).toEqual({
      kind: "movie",
      genres: [28],
      sort: "rating",
      page: 3,
      region: "US",
      regionFromUrl: false,
      providers: [8, 9],
    });
  });
});

describe("browseHref providers", () => {
  const base = { kind: "movie" as const, genres: [], sort: "popularity" as const, page: 1, region: "US", regionFromUrl: false };

  it("writes services comma-joined after the genres, and leaves an empty selection out", () => {
    expect(browseHref({ ...base, providers: [8, 337] })).toBe("/?providers=8,337");
    expect(browseHref({ ...base, providers: [] })).toBe("/");
    expect(
      browseHref({ ...base, kind: "tv", genres: [18], providers: [8], region: "ES", regionFromUrl: true, sort: "rating", page: 2 }),
    ).toBe("/?type=tv&genre=18&providers=8&region=ES&sort=rating&page=2");
  });

  it("round-trips genres, services and sort", () => {
    const state = { ...base, genres: [28, 35], providers: [8, 337], sort: "title" as const, page: 2 };
    const query = Object.fromEntries(new URLSearchParams(browseHref(state).slice(2)));
    expect(parseBrowseParams(query, new Set([28, 35]), "US", new Set([8, 337]))).toEqual(state);
  });
});

describe("parseBrowseParams decade", () => {
  it("lists the decades newest first, from the 2020s to the 1970s", () => {
    expect(DECADES).toEqual([2020, 2010, 2000, 1990, 1980, 1970]);
  });

  it.each([2020, 2010, 2000, 1990, 1980, 1970])("reads decade=%i", (decade) => {
    expect(parseBrowseParams({ decade: String(decade) }, known, "US").decade).toBe(decade);
  });

  it("reads All when the param is absent", () => {
    expect(parseBrowseParams({}, known, "US").decade).toBeUndefined();
  });

  it.each(["", "1960", "2015", "2030", "2010s", "abc", " 2010", "02010", "2010.0"])("reads decade=%j as All", (decade) => {
    expect(parseBrowseParams({ decade }, known, "US").decade).toBeUndefined();
  });

  it("uses the first value when the param repeats", () => {
    expect(parseBrowseParams({ decade: ["1990", "2010"] }, known, "US").decade).toBe(1990);
    expect(parseBrowseParams({ decade: ["1960", "2010"] }, known, "US").decade).toBeUndefined();
  });
});

describe("browseHref decade", () => {
  const base = { kind: "movie" as const, genres: [], sort: "popularity" as const, page: 1, region: "US", regionFromUrl: false, providers: [] };

  it("writes decade=<first year> only for a set decade", () => {
    expect(browseHref({ ...base, decade: 2010 })).toBe("/?decade=2010");
    expect(browseHref({ ...base, decade: undefined })).toBe("/");
    expect(browseHref(base)).toBe("/");
  });

  it("keeps the decade alongside every other param", () => {
    expect(
      browseHref({ ...base, kind: "tv", genres: [18], providers: [8], decade: 1990, region: "ES", regionFromUrl: true, sort: "release", page: 2 }),
    ).toBe("/?type=tv&genre=18&providers=8&decade=1990&region=ES&sort=release&page=2");
  });

  it("round-trips a decade with genres, services and sort", () => {
    const state = { ...base, genres: [28], providers: [8], decade: 1980 as const, sort: "rating" as const, page: 3 };
    const query = Object.fromEntries(new URLSearchParams(browseHref(state).slice(2)));
    expect(parseBrowseParams(query, known, "US", new Set([8]))).toEqual(state);
  });
});

describe("parseBrowseParams rating", () => {
  it("lists the minimum ratings lowest first", () => {
    expect(RATINGS).toEqual([6, 7, 8]);
  });

  it.each([6, 7, 8])("reads rating=%i", (rating) => {
    expect(parseBrowseParams({ rating: String(rating) }, known, "US").rating).toBe(rating);
  });

  it("reads Any when the param is absent", () => {
    expect(parseBrowseParams({}, known, "US").rating).toBeUndefined();
  });

  it.each(["", "5", "9", "7.5", "abc", " 7", "07", "7.0", "6+"])("reads rating=%j as Any", (rating) => {
    expect(parseBrowseParams({ rating }, known, "US").rating).toBeUndefined();
  });

  it("uses the first value when the param repeats", () => {
    expect(parseBrowseParams({ rating: ["8", "6"] }, known, "US").rating).toBe(8);
    expect(parseBrowseParams({ rating: ["5", "7"] }, known, "US").rating).toBeUndefined();
  });
});

describe("browseHref rating", () => {
  const base = { kind: "movie" as const, genres: [], sort: "popularity" as const, page: 1, region: "US", regionFromUrl: false, providers: [] };

  it("writes rating=<n> only for a set rating", () => {
    expect(browseHref({ ...base, rating: 7 })).toBe("/?rating=7");
    expect(browseHref({ ...base, rating: undefined })).toBe("/");
    expect(browseHref(base)).toBe("/");
  });

  it("writes the rating after the decade, alongside every other param", () => {
    expect(
      browseHref({ ...base, kind: "tv", genres: [18], providers: [8], decade: 1990, rating: 8, region: "ES", regionFromUrl: true, sort: "release", page: 2 }),
    ).toBe("/?type=tv&genre=18&providers=8&decade=1990&rating=8&region=ES&sort=release&page=2");
  });

  it("round-trips a rating with genres, services, decade and sort", () => {
    const state = { ...base, genres: [28], providers: [8], decade: 1980 as const, rating: 6 as const, sort: "rating" as const, page: 3 };
    const query = Object.fromEntries(new URLSearchParams(browseHref(state).slice(2)));
    expect(parseBrowseParams(query, known, "US", new Set([8]))).toEqual(state);
  });
});

describe("parseBrowseParams runtime", () => {
  it("lists the maximum runtimes shortest first", () => {
    expect(RUNTIMES).toEqual([90, 120, 150]);
  });

  it.each([90, 120, 150])("reads runtime=%i", (runtime) => {
    expect(parseBrowseParams({ runtime: String(runtime) }, known, "US").runtime).toBe(runtime);
  });

  it("reads Any when the param is absent", () => {
    expect(parseBrowseParams({}, known, "US").runtime).toBeUndefined();
  });

  it.each(["", "60", "100", "90.5", "090", "abc", " 90", "90.0", "180"])("reads runtime=%j as Any", (runtime) => {
    expect(parseBrowseParams({ runtime }, known, "US").runtime).toBeUndefined();
  });

  it("uses the first value when the param repeats", () => {
    expect(parseBrowseParams({ runtime: ["120", "90"] }, known, "US").runtime).toBe(120);
    expect(parseBrowseParams({ runtime: ["100", "90"] }, known, "US").runtime).toBeUndefined();
  });
});

describe("browseHref runtime", () => {
  const base = { kind: "movie" as const, genres: [], sort: "popularity" as const, page: 1, region: "US", regionFromUrl: false, providers: [] };

  it("writes runtime=<n> only for a set runtime", () => {
    expect(browseHref({ ...base, runtime: 120 })).toBe("/?runtime=120");
    expect(browseHref({ ...base, runtime: undefined })).toBe("/");
    expect(browseHref(base)).toBe("/");
  });

  it("writes the runtime after the rating, alongside every other param", () => {
    expect(
      browseHref({ ...base, kind: "tv", genres: [18], providers: [8], decade: 1990, rating: 8, runtime: 90, region: "ES", regionFromUrl: true, sort: "release", page: 2 }),
    ).toBe("/?type=tv&genre=18&providers=8&decade=1990&rating=8&runtime=90&region=ES&sort=release&page=2");
  });

  it("round-trips a runtime with genres, services, decade, rating and sort", () => {
    const state = { ...base, genres: [28], providers: [8], decade: 1980 as const, rating: 6 as const, runtime: 150 as const, sort: "rating" as const, page: 3 };
    const query = Object.fromEntries(new URLSearchParams(browseHref(state).slice(2)));
    expect(parseBrowseParams(query, known, "US", new Set([8]))).toEqual(state);
  });
});

describe("parseBrowseParams language", () => {
  it("lists English, Spanish, French, Japanese and Korean, in that order", () => {
    expect(LANGUAGES).toEqual(["en", "es", "fr", "ja", "ko"]);
    expect(LANGUAGES.map((language) => LANGUAGE_NAMES[language])).toEqual(["English", "Spanish", "French", "Japanese", "Korean"]);
  });

  it.each(["en", "es", "fr", "ja", "ko"])("reads language=%s", (language) => {
    expect(parseBrowseParams({ language }, known, "US").language).toBe(language);
  });

  it("reads Any when the param is absent", () => {
    expect(parseBrowseParams({}, known, "US").language).toBeUndefined();
  });

  it.each(["", "EN", "Es", "de", "en-US", "english", " en", "en ", "zh"])("reads language=%j as Any", (language) => {
    expect(parseBrowseParams({ language }, known, "US").language).toBeUndefined();
  });

  it("uses the first value when the param repeats", () => {
    expect(parseBrowseParams({ language: ["ja", "en"] }, known, "US").language).toBe("ja");
    expect(parseBrowseParams({ language: ["EN", "en"] }, known, "US").language).toBeUndefined();
  });
});

describe("browseHref language", () => {
  const base = { kind: "movie" as const, genres: [], sort: "popularity" as const, page: 1, region: "US", regionFromUrl: false, providers: [] };

  it("writes language=<code> only for a set language", () => {
    expect(browseHref({ ...base, language: "es" })).toBe("/?language=es");
    expect(browseHref({ ...base, language: undefined })).toBe("/");
    expect(browseHref(base)).toBe("/");
  });

  it("writes the language after the runtime, alongside every other param", () => {
    expect(
      browseHref({ ...base, kind: "tv", genres: [18], providers: [8], decade: 1990, rating: 8, runtime: 90, language: "ko", region: "ES", regionFromUrl: true, sort: "release", page: 2 }),
    ).toBe("/?type=tv&genre=18&providers=8&decade=1990&rating=8&runtime=90&language=ko&region=ES&sort=release&page=2");
  });

  it("round-trips a language with genres, services, decade, rating, runtime and sort", () => {
    const state = { ...base, genres: [28], providers: [8], decade: 1980 as const, rating: 6 as const, runtime: 150 as const, language: "fr" as const, sort: "rating" as const, page: 3 };
    const query = Object.fromEntries(new URLSearchParams(browseHref(state).slice(2)));
    expect(parseBrowseParams(query, known, "US", new Set([8]))).toEqual(state);
  });
});

describe("clearFiltersHref", () => {
  const filtered = { kind: "tv" as const, genres: [18], providers: [8], decade: 2010 as const, region: "ES", regionFromUrl: true, sort: "rating" as const, page: 3 };

  it("drops genre, services, decade and page, keeping type, an explicit region and sort", () => {
    expect(clearFiltersHref(filtered)).toBe("/?type=tv&region=ES&sort=rating");
  });

  it("leaves out a region that did not come from the URL", () => {
    expect(clearFiltersHref({ ...filtered, regionFromUrl: false })).toBe("/?type=tv&sort=rating");
  });

  it("is the bare home page when nothing else remains", () => {
    expect(clearFiltersHref({ ...filtered, kind: "movie", sort: "popularity", regionFromUrl: false })).toBe("/");
  });

  it("drops the rating too", () => {
    expect(clearFiltersHref({ ...filtered, rating: 8 })).toBe("/?type=tv&region=ES&sort=rating");
    expect(clearFiltersHref({ ...filtered, genres: [], providers: [], decade: undefined, rating: 7 })).toBe("/?type=tv&region=ES&sort=rating");
  });

  it("drops the runtime too", () => {
    expect(clearFiltersHref({ ...filtered, rating: 8, runtime: 120 })).toBe("/?type=tv&region=ES&sort=rating");
    expect(clearFiltersHref({ ...filtered, genres: [], providers: [], decade: undefined, runtime: 90 })).toBe("/?type=tv&region=ES&sort=rating");
  });

  it("drops the language too", () => {
    expect(clearFiltersHref({ ...filtered, runtime: 120, language: "es" })).toBe("/?type=tv&region=ES&sort=rating");
    expect(clearFiltersHref({ ...filtered, genres: [], providers: [], decade: undefined, language: "ja" })).toBe("/?type=tv&region=ES&sort=rating");
  });
});

describe("hasFilters", () => {
  const base = { kind: "movie" as const, genres: [], sort: "popularity" as const, page: 1, region: "US", regionFromUrl: false, providers: [] };

  it("is true with a genre, a service or a decade", () => {
    expect(hasFilters({ ...base, genres: [28] })).toBe(true);
    expect(hasFilters({ ...base, providers: [8] })).toBe(true);
    expect(hasFilters({ ...base, decade: 2010 })).toBe(true);
  });

  it("is true with a rating alone", () => {
    expect(hasFilters({ ...base, rating: 6 })).toBe(true);
    expect(hasFilters(parseBrowseParams({ rating: "8" }, known, "US"))).toBe(true);
  });

  it("is true with a runtime alone", () => {
    expect(hasFilters({ ...base, runtime: 150 })).toBe(true);
    expect(hasFilters(parseBrowseParams({ runtime: "90" }, known, "US"))).toBe(true);
  });

  it("is true with a language alone", () => {
    expect(hasFilters({ ...base, language: "ko" })).toBe(true);
    expect(hasFilters(parseBrowseParams({ language: "es" }, known, "US"))).toBe(true);
  });

  it("is false with none of them, whatever the type, sort, region or page", () => {
    expect(hasFilters(base)).toBe(false);
    expect(hasFilters({ ...base, kind: "tv", sort: "rating", region: "ES", regionFromUrl: true, page: 2 })).toBe(false);
  });

  it("is false for raw filter params the parse drops", () => {
    expect(hasFilters(parseBrowseParams({ decade: "1960", genre: "abc", providers: "8", rating: "7.5", runtime: "100", language: "EN" }, known, "US"))).toBe(false);
  });
});

describe("toggleId", () => {
  it("adds an unselected id in ascending order", () => {
    expect(toggleId([8, 337], 15)).toEqual([8, 15, 337]);
    expect(toggleId([], 28)).toEqual([28]);
  });

  it("removes a selected id, down to an empty selection", () => {
    expect(toggleId([8, 15, 337], 15)).toEqual([8, 337]);
    expect(toggleId([28], 28)).toEqual([]);
  });

  it("leaves the selection it was given unchanged", () => {
    const selected = [8, 337];
    toggleId(selected, 15);
    toggleId(selected, 8);
    expect(selected).toEqual([8, 337]);
  });
});

describe("parseBrowseParams saved services", () => {
  // Some of the US top 12 for movies: Netflix, Amazon Prime Video, Disney Plus, Hulu.
  const listed = new Set([8, 9, 337, 15]);

  it("applies the saved services the top 12 lists when the URL has no providers param", () => {
    // 149 (Movistar Plus+) is saved from Spain and not in the US top 12.
    expect(parseBrowseParams({}, known, "US", listed, [8, 149, 337])).toMatchObject({ providers: [8, 337], hasSavedServices: true });
  });

  it("applies no service when none of the saved services is in the top 12", () => {
    expect(parseBrowseParams({}, known, "US", listed, [149])).toMatchObject({ providers: [], hasSavedServices: true });
  });

  it("lets a providers param with ids win over the saved services", () => {
    expect(parseBrowseParams({ providers: "9" }, known, "US", listed, [8, 337])).toMatchObject({ providers: [9], hasSavedServices: true });
    // Ids the top 12 does not list are still the URL's choice: no saved service applies.
    expect(parseBrowseParams({ providers: "149" }, known, "US", listed, [8])).toMatchObject({ providers: [], hasSavedServices: true });
  });

  it("applies no service with providers=any", () => {
    expect(parseBrowseParams({ providers: "any" }, known, "US", listed, [8, 337])).toMatchObject({ providers: [], hasSavedServices: true });
  });

  it("reads providers=any as no service, and marks no saved services, when nothing is saved", () => {
    const state = parseBrowseParams({ providers: "any" }, known, "US", listed);
    expect(state.providers).toEqual([]);
    expect(state.hasSavedServices).toBeFalsy();
    expect(parseBrowseParams({}, known, "US", listed, []).hasSavedServices).toBeFalsy();
  });
});

describe("browseHref saved services", () => {
  const base = { kind: "movie" as const, genres: [], sort: "popularity" as const, page: 1, region: "US", regionFromUrl: false, providers: [] };

  it("writes providers=any for no service while saved services exist", () => {
    expect(browseHref({ ...base, hasSavedServices: true })).toBe("/?providers=any");
    expect(browseHref({ ...base, hasSavedServices: true, kind: "tv", genres: [18], rating: 7, sort: "rating", page: 2 })).toBe(
      "/?type=tv&genre=18&providers=any&rating=7&sort=rating&page=2",
    );
  });

  it("writes the ids of an explicit selection while saved services exist", () => {
    expect(browseHref({ ...base, hasSavedServices: true, providers: [8, 337] })).toBe("/?providers=8,337");
  });

  it("never writes providers=any without saved services", () => {
    expect(browseHref(base)).toBe("/");
    expect(browseHref({ ...base, hasSavedServices: false })).toBe("/");
  });

  it("clears filters to providers=any while saved services exist", () => {
    expect(clearFiltersHref({ ...base, hasSavedServices: true, providers: [8], genres: [28], decade: 2010 })).toBe("/?providers=any");
    expect(clearFiltersHref({ ...base, providers: [8], genres: [28] })).toBe("/");
  });

  it("round-trips providers=any so the saved services do not re-apply", () => {
    const state = { ...base, hasSavedServices: true, genres: [28], sort: "title" as const, page: 2 };
    const query = Object.fromEntries(new URLSearchParams(browseHref(state).slice(2)));
    expect(parseBrowseParams(query, known, "US", new Set([8, 337]), [8])).toEqual(state);
  });
});
