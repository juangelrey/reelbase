import Link from "next/link";
import { SearchBox } from "./search-box";
import { ThemeToggle } from "./theme-toggle";
import { WatchlistNavLink } from "./watchlist-nav-link";

type SiteHeaderProps = {
  /** Flag `settings-page`, read in the layout: a gear link to /settings stands in for the theme toggle. */
  settingsPage: boolean;
};

export function SiteHeader({ settingsPage }: SiteHeaderProps) {
  return (
    // Named, so it stays still while the page content crossfades (globals.css).
    <header className="border-b border-zinc-800 bg-zinc-950/90" style={{ viewTransitionName: "site-header" }}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" className="text-xl font-bold tracking-tight text-amber-400 hover:text-amber-300">
          Reelbase
        </Link>
        <SearchBox />
        <nav aria-label="Main" className="ml-auto">
          <ul className="flex items-center gap-4 text-sm">
            <li>
              <WatchlistNavLink />
            </li>
            {settingsPage && (
              <li>
                <Link
                  href="/settings"
                  aria-label="Settings"
                  className="block rounded p-1 text-zinc-300 hover:text-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                >
                  <GearIcon />
                </Link>
              </li>
            )}
          </ul>
        </nav>
        {!settingsPage && <ThemeToggle />}
      </div>
    </header>
  );
}

function GearIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
