import { MAX_PAGES } from "./map";
import type { TitleKind } from "./types";

export type SearchParamValue = string | string[] | undefined;

export const SORT_KEYS = ["popularity", "rating", "release", "title"] as const;

export type SortKey = (typeof SORT_KEYS)[number];

export const DEFAULT_SORT: SortKey = "popularity";

/** The browse decades, newest first, each named by its first year (`decade=2010` is 2010 to 2019). */
export const DECADES = [2020, 2010, 2000, 1990, 1980, 1970] as const;

export type Decade = (typeof DECADES)[number];

/** The minimum TMDB average votes a browse can ask for, lowest first (`rating=7` is 7 and above). */
export const RATINGS = [6, 7, 8] as const;

export type Rating = (typeof RATINGS)[number];

/** The maximum runtimes a browse can ask for, in minutes, shortest first (`runtime=120` is under 120 minutes). */
export const RUNTIMES = [90, 120, 150] as const;

export type Runtime = (typeof RUNTIMES)[number];

/** The original languages a browse can ask for, as TMDB's ISO 639-1 codes, in pill order. */
export const LANGUAGES = ["en", "es", "fr", "ja", "ko"] as const;

export type Language = (typeof LANGUAGES)[number];

/** Each browse language's English name, for its pill and the empty-grid text. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  ja: "Japanese",
  ko: "Korean",
};

export interface BrowseState {
  /** Movies or TV series; `type=tv` in the URL, movies when absent. */
  kind: TitleKind;
  /**
   * TMDB genre ids from the genre list of `kind` (movie and TV genre ids differ), ascending and without
   * duplicates; empty for all genres. A title must match every one. `genre=28,35` in the URL.
   */
  genres: number[];
  sort: SortKey;
  page: number;
  /** The watch-provider region that applies (ISO 3166-1, e.g. "ES"), from `resolveRegion`. */
  region: string;
  /**
   * Whether `?region=` named the applied region. Only then do links carry `region`, so an explicit
   * `?region=` keeps beating the cookie on later clicks, while cookie and language defaults stay out of URLs.
   */
  regionFromUrl: boolean;
  /**
   * TMDB watch-provider ids from the top 12 of `region` and `kind`, ascending and without duplicates; empty for
   * any service. A title must stream on at least one. `providers=8,337` in the URL. Links that change the kind or
   * region carry them all, and the target page's parse drops any its own top 12 does not list.
   */
  providers: number[];
  /**
   * Whether the visitor has saved services (flag `settings-page`, cookie `reelbase-services`). Only then do links
   * with no service write `providers=any`, so the saved services do not re-apply mid-browse. Optional so a state
   * without it reads as none saved, and its URLs stay as they were.
   */
  hasSavedServices?: boolean;
  /**
   * The decade titles are released in (first air date for TV), by its first year; absent for All.
   * `decade=2010` in the URL. Optional so a state without it reads as All.
   */
  decade?: Decade;
  /**
   * The minimum TMDB average vote, no rounding; absent for Any. `rating=7` in the URL. Optional so a state
   * without it reads as Any.
   */
  rating?: Rating;
  /**
   * The runtime titles stay under, in minutes (episode runtime for TV); absent for Any. `runtime=120` in the URL.
   * Optional so a state without it reads as Any.
   */
  runtime?: Runtime;
  /**
   * The language titles were originally made in; absent for Any. `language=es` in the URL. Not the language TMDB
   * text is requested in. Optional so a state without it reads as Any.
   */
  language?: Language;
}

export function firstParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The `type` param: "tv", else movie (the default, so links without `type` behave as before). */
export function parseKind(value: SearchParamValue): TitleKind {
  return firstParam(value) === "tv" ? "tv" : "movie";
}

function isSortKey(value: string | undefined): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value ?? "");
}

/** A page number from 1 to TMDB's limit; anything else reads as 1. */
export function parsePage(value: SearchParamValue): number {
  const raw = firstParam(value) ?? "";
  if (!/^[1-9]\d*$/.test(raw)) return 1;
  const page = Number(raw);
  return page <= MAX_PAGES ? page : 1;
}

/** Known ids from a comma-separated list param, ascending, each once. */
function parseIdList(value: SearchParamValue, knownIds: ReadonlySet<number>): number[] {
  const ids = (firstParam(value) ?? "")
    .split(",")
    .filter((part) => /^[1-9]\d*$/.test(part))
    .map(Number)
    .filter((id) => knownIds.has(id));
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** Known genre ids from a comma-separated `genre` param, ascending, each once. */
export function parseGenres(value: SearchParamValue, knownGenreIds: ReadonlySet<number>): number[] {
  return parseIdList(value, knownGenreIds);
}

/** Listed provider ids from a comma-separated `providers` param, ascending, each once. */
export function parseProviders(value: SearchParamValue, listedProviderIds: ReadonlySet<number>): number[] {
  return parseIdList(value, listedProviderIds);
}

/**
 * A pill's target selection: `selected` with `id` removed if present, else added. Ascending, as
 * `BrowseState.genres` and `BrowseState.providers` are, so equal selections share a URL. Returns a new array.
 */
export function toggleId(selected: readonly number[], id: number): number[] {
  return selected.includes(id) ? selected.filter((other) => other !== id) : [...selected, id].sort((a, b) => a - b);
}

/** A listed decade's first year, e.g. "2010"; anything else (`1960`, `2015`, `2010s`, empty) reads as All. */
function parseDecade(value: SearchParamValue): Decade | undefined {
  const raw = firstParam(value);
  return DECADES.find((decade) => String(decade) === raw);
}

/** A listed rating, e.g. "7"; anything else (`5`, `7.5`, `07`, empty) reads as Any. */
function parseRating(value: SearchParamValue): Rating | undefined {
  const raw = firstParam(value);
  return RATINGS.find((rating) => String(rating) === raw);
}

/** A listed runtime, e.g. "120"; anything else (`60`, `100`, `90.5`, `090`, empty) reads as Any. */
function parseRuntime(value: SearchParamValue): Runtime | undefined {
  const raw = firstParam(value);
  return RUNTIMES.find((runtime) => String(runtime) === raw);
}

/** A listed language code, exactly, e.g. "es"; anything else (`EN`, `de`, `en-US`, `english`, empty) reads as Any. */
function parseLanguage(value: SearchParamValue): Language | undefined {
  const raw = firstParam(value);
  return LANGUAGES.find((language) => language === raw);
}

const NO_PROVIDERS: ReadonlySet<number> = new Set();

/** The `providers` value for no service while saved services exist; never written without them. */
const ANY_PROVIDER = "any";

/**
 * The services that apply: `providers=any` gives none, a `providers` param with ids gives its listed ids (the URL
 * wins), and otherwise the saved services the top 12 lists.
 */
function resolveProviders(
  value: SearchParamValue,
  listedProviderIds: ReadonlySet<number>,
  savedServices: readonly number[],
): number[] {
  const raw = firstParam(value) ?? "";
  if (raw === ANY_PROVIDER) return [];
  if (raw.split(",").some((part) => /^[1-9]\d*$/.test(part))) return parseProviders(raw, listedProviderIds);
  return savedServices.filter((id) => listedProviderIds.has(id));
}

/**
 * The browse state from the URL. `knownGenreIds` is the genre list for the kind in `type` (read it with
 * `parseKind` first), so a genre id from the other kind's list is dropped. `region` is the region that
 * applies, from `resolveRegion` over the `region` param, the cookie and `Accept-Language`.
 * `listedProviderIds` is that region's top 12 for the kind, from `listProviders`; any other id in
 * `providers` is dropped, which is how services fall away after a kind or region change. Without it, no
 * service applies. `savedServices` are the visitor's saved provider ids, ascending (`parseSavedServices`), or
 * none when flag `settings-page` is off; they apply only when the URL has no `providers` param with ids.
 */
export function parseBrowseParams(
  params: Record<string, SearchParamValue>,
  knownGenreIds: ReadonlySet<number>,
  region: string,
  listedProviderIds: ReadonlySet<number> = NO_PROVIDERS,
  savedServices: readonly number[] = [],
): BrowseState {
  const sort = firstParam(params.sort);
  return {
    kind: parseKind(params.type),
    genres: parseGenres(params.genre, knownGenreIds),
    sort: isSortKey(sort) ? sort : DEFAULT_SORT,
    page: parsePage(params.page),
    region,
    // An unlisted `?region=` falls through to the cookie or language, so it does not count as from the URL.
    regionFromUrl: firstParam(params.region) === region,
    providers: resolveProviders(params.providers, listedProviderIds, savedServices),
    // Set only when true, so a state with nothing saved is the same object as before saved services.
    ...(savedServices.length > 0 && { hasSavedServices: true }),
    decade: parseDecade(params.decade),
    rating: parseRating(params.rating),
    runtime: parseRuntime(params.runtime),
    language: parseLanguage(params.language),
  };
}

/**
 * A home page URL. `type` is set only for TV, so movie links stay as they were before TV browse, `decade`,
 * `rating`, `runtime` and `language` only when one is set, and `region` only when it came from the URL. List separators stay
 * literal commas (`genre=28,35`, `providers=8,337`), not `%2C`, so links read as the spec writes them. With no
 * service, `providers=any` is written only while saved services exist, so they do not re-apply on the next page.
 */
export function browseHref({ kind, genres, sort, page, region, regionFromUrl, providers, hasSavedServices, decade, rating, runtime, language }: BrowseState): string {
  const query = new URLSearchParams();
  if (kind === "tv") query.set("type", "tv");
  if (genres.length > 0) query.set("genre", genres.join(","));
  if (providers.length > 0) query.set("providers", providers.join(","));
  else if (hasSavedServices) query.set("providers", ANY_PROVIDER);
  if (decade !== undefined) query.set("decade", String(decade));
  if (rating !== undefined) query.set("rating", String(rating));
  if (runtime !== undefined) query.set("runtime", String(runtime));
  if (language !== undefined) query.set("language", language);
  if (regionFromUrl) query.set("region", region);
  if (sort !== DEFAULT_SORT) query.set("sort", sort);
  if (page > 1) query.set("page", String(page));
  const search = query.toString().replaceAll("%2C", ",");
  return search ? `/?${search}` : "/";
}

/**
 * Whether the state applies a genre, a service, a decade, a rating, a runtime or a language: what "Clear filters"
 * removes.
 */
export function hasFilters({ genres, providers, decade, rating, runtime, language }: BrowseState): boolean {
  return (
    genres.length > 0 ||
    providers.length > 0 ||
    decade !== undefined ||
    rating !== undefined ||
    runtime !== undefined ||
    language !== undefined
  );
}

/**
 * The home page URL without genres, services, decade, rating, runtime or language, from page 1; `type`, `sort` and
 * `region` follow `browseHref`.
 */
export function clearFiltersHref(state: BrowseState): string {
  return browseHref({ ...state, genres: [], providers: [], decade: undefined, rating: undefined, runtime: undefined, language: undefined, page: 1 });
}
