import "server-only";
import { TmdbError, tmdbFetch, type TmdbParams } from "@/lib/tmdb/client";
import type {
  TmdbGenreList,
  TmdbMovieDetails,
  TmdbMovieListItem,
  TmdbPaged,
  TmdbPersonDetails,
  TmdbPersonListItem,
  TmdbSeason,
  TmdbTvDetails,
  TmdbTvListItem,
} from "@/lib/tmdb/schema";
import type { BrowseState, SortKey } from "./browse-params";
import {
  defaultSeason,
  toGenre,
  toPaged,
  toPerson,
  toPersonSearchPage,
  toShow,
  toShowSummary,
  toSummary,
  toTitle,
} from "./map";
import type { SearchSortKey } from "./search-params";
import { SEARCH_WINDOW_PAGES, sortSearchItems, windowPage, type SearchItem } from "./search-sort";
import type { Genre, Paged, Person, PersonSummary, Show, ShowSummary, Title, TitleKind, TitleSummary } from "./types";

/** A movie with credits and recommendations in one request, or undefined when TMDB does not know the id. Other failures throw. */
export async function getTitle(id: number): Promise<Title | undefined> {
  try {
    return toTitle(await tmdbFetch<TmdbMovieDetails>(`/movie/${id}`, { append_to_response: "credits,recommendations" }));
  } catch (error) {
    if (error instanceof TmdbError && error.status === 404) return undefined;
    throw error;
  }
}

/**
 * A TV show with credits, recommendations and the episodes of season `season` (default 1) in one request, or undefined when
 * TMDB does not know the id or flags the show adult or softcore. When the show has no such season, one more
 * request fetches its default season (season 1, else the first listed). Other failures throw.
 */
export async function getShow(id: number, season = 1): Promise<Show | undefined> {
  let show: TmdbTvDetails;
  try {
    show = await tmdbFetch<TmdbTvDetails>(`/tv/${id}`, { append_to_response: `credits,recommendations,season/${season}` });
  } catch (error) {
    if (error instanceof TmdbError && error.status === 404) return undefined;
    throw error;
  }
  if (show.adult || show.softcore) return undefined;
  const requested = show[`season/${season}`];
  if (requested) return toShow(show, requested);
  const fallback = defaultSeason(toShow(show).seasons);
  if (fallback === undefined || fallback === season) return toShow(show);
  return toShow(show, await tmdbFetch<TmdbSeason>(`/tv/${id}/season/${fallback}`));
}

/**
 * A person with their combined credits (movies and TV) in one request, or undefined when TMDB does not
 * know the id or flags the person adult. Other failures throw. `today` is "YYYY-MM-DD"; it decides which
 * titles in the career are upcoming.
 */
export async function getPerson(id: number, today: string): Promise<Person | undefined> {
  let person: TmdbPersonDetails;
  try {
    person = await tmdbFetch<TmdbPersonDetails>(`/person/${id}`, { append_to_response: "combined_credits" });
  } catch (error) {
    if (error instanceof TmdbError && error.status === 404) return undefined;
    throw error;
  }
  return person.adult ? undefined : toPerson(person, today);
}

/** TMDB's genres for movies or for TV; the two lists use different ids for some genres. */
export async function listGenres(kind: TitleKind = "movie"): Promise<Genre[]> {
  const { genres } = await tmdbFetch<TmdbGenreList>(`/genre/${kind}/list`);
  return genres.map(toGenre);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The discover field for a title's release: the first air date for TV. */
function releaseField(kind: TitleKind): string {
  return kind === "tv" ? "first_air_date" : "primary_release_date";
}

/**
 * TMDB discover params per sort and kind. Release date skips near-empty placeholder entries (its cap at today
 * is in `releaseDateParams`); for TV it is the first air date, and the title sort is by name.
 */
function sortParams(sort: SortKey, kind: TitleKind): TmdbParams {
  switch (sort) {
    case "popularity":
      return { sort_by: "popularity.desc" };
    case "rating":
      return { sort_by: "vote_average.desc", "vote_count.gte": 200 };
    case "release":
      return { sort_by: `${releaseField(kind)}.desc`, "vote_count.gte": 50 };
    case "title":
      return { sort_by: kind === "tv" ? "name.asc" : "title.asc" };
  }
}

/**
 * Discover params for the selected services: titles on any of them (`|` means "or" to TMDB) in the region,
 * streaming by subscription, free or with ads, never rent or buy. None when no service is selected.
 */
function providerParams({ providers, region }: BrowseState): TmdbParams {
  if (providers.length === 0) return {};
  return {
    with_watch_providers: providers.join("|"),
    watch_region: region,
    with_watch_monetization_types: "flatrate|free|ads",
  };
}

/**
 * The release date bounds, built in one place so the two upper bounds cannot overwrite each other: the decade
 * keeps titles released from 1 January of its first year to 31 December of its last, and the release sort skips
 * unreleased titles. With both, the earlier upper bound applies. None for All with any other sort.
 */
function releaseDateParams({ decade, sort }: BrowseState, kind: TitleKind): TmdbParams {
  const field = releaseField(kind);
  const params: TmdbParams = {};
  const upperBounds: string[] = [];
  if (decade !== undefined) {
    params[`${field}.gte`] = `${decade}-01-01`;
    upperBounds.push(`${decade + 9}-12-31`);
  }
  if (sort === "release") upperBounds.push(today());
  // "YYYY-MM-DD" strings sort as dates do.
  if (upperBounds.length > 0) params[`${field}.lte`] = upperBounds.sort()[0];
  return params;
}

/** The vote count a rating-filtered browse asks for in every sort: the Top rated sort's own floor. */
const RATING_VOTE_FLOOR = 200;

/**
 * Discover params for a minimum rating: at least that average vote (TMDB's value, unrounded), from titles with
 * enough votes for it to mean something. Spread after `sortParams`, so its vote floor, the larger of its own and
 * the sort's, replaces the sort's. None for Any, which leaves the sort's floor as it is.
 */
function ratingParams({ rating, sort }: BrowseState, kind: TitleKind): TmdbParams {
  if (rating === undefined) return {};
  const sortFloor = Number(sortParams(sort, kind)["vote_count.gte"] ?? 0);
  return { "vote_average.gte": rating, "vote_count.gte": Math.max(RATING_VOTE_FLOOR, sortFloor) };
}

/**
 * Discover params for a maximum runtime: from 1 minute, so titles with no known runtime (0) drop out, to one
 * minute under the limit, so a title of exactly that length is not shown. TMDB compares episode runtime for TV.
 * It sets no vote floor, so each sort's stays as it is. None for Any.
 */
function runtimeParams({ runtime }: BrowseState): TmdbParams {
  if (runtime === undefined) return {};
  return { "with_runtime.gte": 1, "with_runtime.lte": runtime - 1 };
}

/** A page of movies by genre, service, decade, rating, runtime and sort. */
export async function discoverTitles(state: BrowseState): Promise<Paged<TitleSummary>> {
  const { genres, sort, page } = state;
  const response = await tmdbFetch<TmdbPaged<TmdbMovieListItem>>("/discover/movie", {
    include_adult: false,
    with_genres: genres.length > 0 ? genres.join(",") : undefined,
    ...providerParams(state),
    page,
    ...sortParams(sort, "movie"),
    ...releaseDateParams(state, "movie"),
    ...ratingParams(state, "movie"),
    ...runtimeParams(state),
  });
  return toPaged(response, toSummary);
}

/** A page of TV series by TV genre, service, decade, rating, runtime and sort. */
export async function discoverShows(state: BrowseState): Promise<Paged<ShowSummary>> {
  const { genres, sort, page } = state;
  const response = await tmdbFetch<TmdbPaged<TmdbTvListItem>>("/discover/tv", {
    include_adult: false,
    with_genres: genres.length > 0 ? genres.join(",") : undefined,
    ...providerParams(state),
    page,
    ...sortParams(sort, "tv"),
    ...releaseDateParams(state, "tv"),
    ...ratingParams(state, "tv"),
    ...runtimeParams(state),
  });
  return toPaged(response, toShowSummary);
}

const NO_RESULTS: Paged<never> = { results: [], page: 1, totalPages: 0, totalResults: 0 };

/**
 * One page of a TMDB search. Relevance is TMDB's own page: one call. Any other sort fetches page 1, then
 * the rest of the first `SEARCH_WINDOW_PAGES` pages in parallel, sorts the raw items (they carry the full
 * date, which summaries reduce to a year) and pages through that window: at most 5 calls. A blank query,
 * or a sorted page past the window, returns no results without calling TMDB.
 */
async function search<T extends SearchItem, U>(
  path: string,
  query: string,
  page: number,
  sort: SearchSortKey,
  map: (item: T) => U,
): Promise<Paged<U>> {
  const trimmed = query.trim();
  if (!trimmed) return NO_RESULTS;
  const fetchPage = (number: number) =>
    tmdbFetch<TmdbPaged<T>>(path, { query: trimmed, include_adult: false, page: number });
  if (sort === "relevance") return toPaged(await fetchPage(page), map);
  if (page > SEARCH_WINDOW_PAGES) return { ...NO_RESULTS, page };

  const first = await fetchPage(1);
  const lastPage = Math.min(first.total_pages, SEARCH_WINDOW_PAGES);
  const rest = await Promise.all(Array.from({ length: Math.max(lastPage - 1, 0) }, (_, index) => fetchPage(index + 2)));
  // TMDB can repeat a title on a later page when its order shifts between calls; keep the first.
  const unique = new Map<number, T>();
  for (const item of [first, ...rest].flatMap(({ results }) => results)) if (!unique.has(item.id)) unique.set(item.id, item);
  const items = sortSearchItems([...unique.values()], sort);
  const window = windowPage(items, page);
  return { ...window, results: window.results.map(map) };
}

/** Search movies by title, in the given sort. */
export async function searchTitles(query: string, page: number, sort: SearchSortKey): Promise<Paged<TitleSummary>> {
  return search<TmdbMovieListItem, TitleSummary>("/search/movie", query, page, sort, toSummary);
}

/** Search TV series by name, in the given sort (Recency is by first air date). */
export async function searchShows(query: string, page: number, sort: SearchSortKey): Promise<Paged<ShowSummary>> {
  return search<TmdbTvListItem, ShowSummary>("/search/tv", query, page, sort, toShowSummary);
}

/**
 * Search people by name: TMDB's own order (popularity) and paging, one call per page, adult profiles
 * skipped. A blank query returns no results without calling TMDB.
 */
export async function searchPeople(query: string, page: number): Promise<Paged<PersonSummary>> {
  const trimmed = query.trim();
  if (!trimmed) return NO_RESULTS;
  return toPersonSearchPage(
    await tmdbFetch<TmdbPaged<TmdbPersonListItem>>("/search/person", { query: trimmed, include_adult: false, page }),
  );
}
