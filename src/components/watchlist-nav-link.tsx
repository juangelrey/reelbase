"use client";

import Link from "next/link";
import { useWatchlist } from "@/lib/watchlist/use-watchlist";

/** The header's Watchlist link, with a pill counting saved titles. No pill on the server or before hydration. */
export function WatchlistNavLink() {
  const count = useWatchlist().entries.length;

  return (
    <Link href="/watchlist" className="text-zinc-300 hover:text-strong">
      Watchlist
      {count > 0 && (
        <>
          {/* The space sits outside the hidden span, since accessible-name computation trims each element's text. */}{" "}
          <span className="sr-only">({count} saved)</span>
          <span
            aria-hidden="true"
            data-testid="watchlist-count"
            className="ml-0.5 inline-block rounded-full bg-amber-400 px-1.5 text-xs font-semibold leading-5 text-zinc-950"
          >
            {count > 99 ? "99+" : count}
          </span>
        </>
      )}
    </Link>
  );
}
