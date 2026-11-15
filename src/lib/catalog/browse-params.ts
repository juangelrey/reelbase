import { MAX_PAGES } from "./map";
import { isIdPart } from "./id-list";
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

/** Where a browse's services came from while saved services exist, or Settings only; see `BrowseState.providerSource`. */
export type ProviderSource = "saved" | "url" | "any" | "settings";

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
   * Where `providers` came from while the visitor has saved services (flag `settings-page`, cookie
   * `reelbase-services`): `"saved"` when the URL has no `providers` param and the saved services the top 12 lists
   * apply (possibly none), `"url"` when a `providers` param with ids won, and `"any"` for `providers=any`. Absent
   * when nothing is saved, so URLs stay as they were before saved services. See `browseHref` for what each writes.
   * `"settings"` marks the Settings-only mode (flags `services-from-settings` and `settings-page`): the services are
   * the saved ones the top 12 lists (possibly none), whatever the URL says, and no link writes `providers`.
   */
  providerSource?: ProviderSource;
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
    .filter(isIdPart)
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
 * The services that apply and where they came from: `providers=any` gives none, a `providers` param with ids gives
 * its listed ids (the URL wins), and otherwise the saved services the top 12 lists. The source is set only while
 * saved services exist.
 */
function resolveProviders(
  value: SearchParamValue,
  listedProviderIds: ReadonlySet<number>,
  savedServices: readonly number[],
): Pick<BrowseState, "providers" | "providerSource"> {
  const raw = firstParam(value) ?? "";
  const [providers, source]: [number[], ProviderSource] =
    raw === ANY_PROVIDER
      ? [[], "any"]
      : raw.split(",").some(isIdPart)
        ? [parseProviders(raw, listedProviderIds), "url"]
        : [savedServices.filter((id) => listedProviderIds.has(id)), "saved"];
  // Set only while saved services exist, so a state with nothing saved is the same object as before saved services.
  return savedServices.length > 0 ? { providers, providerSource: source } : { providers };
}

/** The saved services the top 12 lists, whatever the URL says: the Settings-only mode. */
function settingsProviders(
  listedProviderIds: ReadonlySet<number>,
  savedServices: readonly number[],
): Pick<BrowseState, "providers" | "providerSource"> {
  return { providers: savedServices.filter((id) => listedProviderIds.has(id)), providerSource: "settings" };
}

/**
 * The browse state from the URL. `knownGenreIds` is the genre list for the kind in `type` (read it with
 * `parseKind` first), so a genre id from the other kind's list is dropped. `region` is the region that
 * applies, from `resolveRegion` over the `region` param, the cookie and `Accept-Language`.
 * `listedProviderIds` is that region's top 12 for the kind, from `listProviders`; any other id in
 * `providers` is dropped, which is how services fall away after a kind or region change. Without it, no
 * service applies. `savedServices` are the visitor's saved provider ids, ascending (`parseSavedServices`), or
 * none when flag `settings-page` is off; they apply only when the URL has no `providers` param with ids.
 * With `servicesFromSettings` (flags `services-from-settings` and `settings-page` on), the `providers` param is
 * ignored and the saved services always apply, with source `"settings"`.
 */
export function parseBrowseParams(
  params: Record<string, SearchParamValue>,
  knownGenreIds: ReadonlySet<number>,
  region: string,
  listedProviderIds: ReadonlySet<number> = NO_PROVIDERS,
  savedServices: readonly number[] = [],
  servicesFromSettings = false,
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
    ...(servicesFromSettings
      ? settingsProviders(listedProviderIds, savedServices)
      : resolveProviders(params.providers, listedProviderIds, savedServices)),
    decade: parseDecade(params.decade),
    rating: parseRating(params.rating),
    runtime: parseRuntime(params.runtime),
    language: parseLanguage(params.language),
  };
}

/**
 * A home page URL. `type` is set only for TV, so movie links stay as they were before TV browse, `decade`,
 * `rating`, `runtime` and `language` only when one is set, and `region` only when it came from the URL. List separators stay
 * literal commas (`genre=28,35`, `providers=8,337`), not `%2C`, so links read as the spec writes them.
 *
 * `providers` follows `providerSource`. From the saved services (`"saved"`), it is left out, so the target page
 * resolves the saved services for its own kind and region, even when none applied here. From the URL or Any
 * service (`"url"`, `"any"`), it is the ids, or `providers=any` for none, so the saved services do not re-apply
 * mid-browse. With nothing saved (no source), it is the ids, or left out for none, and `any` is never written.
 * From Settings only (`"settings"`), it is always left out. Links that pick services set the source with
 * `withProviders`.
 */
export function browseHref({ kind, genres, sort, page, region, regionFromUrl, providers, providerSource, decade, rating, runtime, language }: BrowseState): string {
  const query = new URLSearchParams();
  if (kind === "tv") query.set("type", "tv");
  if (genres.length > 0) query.set("genre", genres.join(","));
  if (providerSource !== "saved" && providerSource !== "settings") {
    if (providers.length > 0) query.set("providers", providers.join(","));
    else if (providerSource !== undefined) query.set("providers", ANY_PROVIDER);
  }
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
 * `state` with the visitor's own service choice `providers` (a pill, Any service, Clear filters): while saved
 * services exist, its source becomes the URL's, or `"any"` for none, so `browseHref` writes the ids or
 * `providers=any` rather than leaving the saved services to apply. With nothing saved, only the services change.
 * From Settings only, home offers no service choice, so the state is returned unchanged.
 */
export function withProviders(state: BrowseState, providers: number[]): BrowseState {
  if (state.providerSource === "settings") return state;
  if (state.providerSource === undefined) return { ...state, providers };
  return { ...state, providers, providerSource: providers.length > 0 ? "url" : "any" };
}

/**
 * Whether the state applies a genre, a service, a decade, a rating, a runtime or a language: what "Clear filters"
 * removes. From Settings only, the services are not counted, since Clear filters leaves them as they are.
 */
export function hasFilters({ genres, providers, providerSource, decade, rating, runtime, language }: BrowseState): boolean {
  return (
    genres.length > 0 ||
    (providerSource !== "settings" && providers.length > 0) ||
    decade !== undefined ||
    rating !== undefined ||
    runtime !== undefined ||
    language !== undefined
  );
}

/**
 * The home page URL without genres, services, decade, rating, runtime or language, from page 1; `type`, `sort` and
 * `region` follow `browseHref`. From Settings only, the services stay the saved ones, as no link writes them.
 */
export function clearFiltersHref(state: BrowseState): string {
  return browseHref({ ...withProviders(state, []), genres: [], decade: undefined, rating: undefined, runtime: undefined, language: undefined, page: 1 });
}
