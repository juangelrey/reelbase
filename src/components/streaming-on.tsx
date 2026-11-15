import Link from "next/link";
import type { Provider } from "@/lib/catalog/providers";

interface StreamingOnProps {
  /** The region's top 12 services for the kind, in TMDB's display order, from `listProviders` (server-only). */
  providers: Provider[];
  /** The ids of the services that apply (`BrowseState.providers`). */
  selected: readonly number[];
}

/**
 * Home's services line while they come from Settings only: the names of the services that apply, in TMDB's
 * display order, or "Any service" when none does, and a link to change them on /settings.
 */
export function StreamingOn({ providers, selected }: StreamingOnProps) {
  const names = providers.filter(({ id }) => selected.includes(id)).map(({ name }) => name);
  return (
    <p className="text-sm text-zinc-400">
      Streaming on: <span className="text-zinc-200">{names.length > 0 ? names.join(", ") : "Any service"}</span>{" "}
      <Link
        href="/settings"
        className="rounded underline hover:text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
      >
        Change
      </Link>
    </p>
  );
}
