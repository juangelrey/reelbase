"use client";

import { useSyncExternalStore } from "react";
import type { Provider } from "@/lib/catalog/providers";
import { SERVICES_COOKIE, parseSavedServices, savedServicesCookie, toggleSavedService } from "@/lib/catalog/saved-services";
import { JustWatchCredit, ProviderLogo } from "./provider-filter";

interface MyServicesProps {
  /** The region's streaming services, from `listStreamingServices` (server-only, so passed in). */
  services: Provider[];
  /** Every saved provider id the server read, including ids this region does not list, which stay saved. */
  saved: number[];
  /** Whether to show the "Streaming data by JustWatch" credit: only while flag `services-from-settings` is off. */
  credit?: boolean;
}

/** Re-renders every mounted list after a write here; the window's focus covers a write from another tab. */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("focus", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("focus", listener);
  };
}

/** The browser's `reelbase-services` cookie value now, or "" when it holds none. */
function readSavedCookie(): string {
  const prefix = `${SERVICES_COOKIE}=`;
  return document.cookie.split("; ").find((pair) => pair.startsWith(prefix))?.slice(prefix.length) ?? "";
}

/**
 * Saves the cookie as it is now with `id` toggled, and re-renders the lists; called from event handlers only.
 * Starting from the cookie, not from what a list shows, keeps services another tab saved since.
 */
function toggleSavedCookie(id: number) {
  document.cookie = savedServicesCookie(toggleSavedService(parseSavedServices(readSavedCookie()), id));
  for (const listener of listeners) listener();
}

/** On the server and while hydrating, the cookie is the one the server read: the `saved` prop. */
function serverSnapshot(): null {
  return null;
}

/**
 * A checkbox per streaming service; toggling one saves the choice in the `reelbase-services` cookie at once.
 * Saved ids the region does not list are not shown but are kept in every write. Both the ticks and each write
 * start from the cookie as it is now, not as the server read it, so a stale page (a second tab, or Back restoring
 * a cached one) never drops services saved since.
 */
export function MyServices({ services, saved: serverSaved, credit = false }: MyServicesProps) {
  const cookie = useSyncExternalStore(subscribe, readSavedCookie, serverSnapshot);
  const saved = cookie === null ? serverSaved : parseSavedServices(cookie);
  if (services.length === 0) return <p className="text-sm text-zinc-400">No streaming services listed for this region.</p>;

  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-2">
        {services.map((service) => (
          <li key={service.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300 has-[:checked]:border-amber-400 has-[:checked]:text-strong has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-amber-400">
              <input
                type="checkbox"
                value={service.id}
                checked={saved.includes(service.id)}
                onChange={() => toggleSavedCookie(service.id)}
                className="accent-amber-400"
              />
              {/* The logo's alt repeats the name, so it stays out of the checkbox's name. */}
              <span aria-hidden>
                <ProviderLogo provider={service} />
              </span>
              {service.name}
            </label>
          </li>
        ))}
      </ul>
      {credit && <JustWatchCredit />}
    </div>
  );
}
