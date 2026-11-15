"use client";

import { useState } from "react";
import type { Provider } from "@/lib/catalog/providers";
import { savedServicesCookie, toggleSavedService } from "@/lib/catalog/saved-services";
import { JustWatchCredit, ProviderLogo } from "./provider-filter";

interface MyServicesProps {
  /** The region's streaming services, from `listStreamingServices` (server-only, so passed in). */
  services: Provider[];
  /** Every saved provider id, including ids this region does not list, which stay saved. */
  saved: number[];
}

/** Saves `ids` in the browser's `reelbase-services` cookie; called from event handlers only. */
function writeSavedServices(ids: readonly number[]) {
  document.cookie = savedServicesCookie(ids);
}

/**
 * A checkbox per streaming service; toggling one saves the choice in the `reelbase-services` cookie at once.
 * Saved ids the region does not list are not shown but are kept in every write.
 */
export function MyServices({ services, saved: initialSaved }: MyServicesProps) {
  const [saved, setSaved] = useState(initialSaved);
  if (services.length === 0) return <p className="text-sm text-zinc-400">No streaming services listed for this region.</p>;

  function toggle(id: number) {
    const next = toggleSavedService(saved, id);
    writeSavedServices(next);
    setSaved(next);
  }

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
                onChange={() => toggle(service.id)}
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
      <JustWatchCredit />
    </div>
  );
}
