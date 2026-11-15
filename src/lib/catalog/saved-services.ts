// No `server-only`: the Settings checkboxes write the cookie from the browser, and home reads it on the server.
import { isIdPart } from "./id-list";

/** The first-party cookie that remembers the streaming services the visitor subscribes to, as TMDB provider ids. */
export const SERVICES_COOKIE = "reelbase-services";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Ascending, each once. */
function normalize(ids: readonly number[]): number[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}

/**
 * The saved services in the cookie value: its comma-separated provider ids, ascending, each once. A missing or
 * malformed value gives none; entries that are not a positive whole id are dropped.
 */
export function parseSavedServices(value: string | undefined): number[] {
  if (!value) return [];
  return normalize(
    value
      .split(",")
      .filter(isIdPart)
      .map(Number)
      .filter(Number.isSafeInteger),
  );
}

/**
 * A `document.cookie` assignment that saves `ids` for a year, `SameSite=Lax`, on path `/`; an empty list expires it.
 */
export function savedServicesCookie(ids: readonly number[]): string {
  const value = normalize(ids).join(",");
  return `${SERVICES_COOKIE}=${value}; Max-Age=${value ? ONE_YEAR_SECONDS : 0}; Path=/; SameSite=Lax`;
}

/** `saved` with `id` added or removed, ascending; ids the current region does not list stay as they are. */
export function toggleSavedService(saved: readonly number[], id: number): number[] {
  return saved.includes(id) ? saved.filter((savedId) => savedId !== id) : normalize([...saved, id]);
}
