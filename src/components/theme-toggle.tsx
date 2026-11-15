"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { OS_LIGHT_QUERY, THEME_STORAGE_KEY, parseThemeChoice, resolveTheme, type ThemeChoice } from "@/lib/theme/theme";

const OPTIONS: { choice: ThemeChoice; label: string }[] = [
  { choice: "system", label: "System" },
  { choice: "light", label: "Light" },
  { choice: "dark", label: "Dark" },
];

/** The last choice storage refused to save. Stands in for storage while it is blocked, so the toggle still works. */
let unsavedChoice: ThemeChoice = "system";
const listeners = new Set<() => void>();

function readChoice(): ThemeChoice {
  try {
    return parseThemeChoice(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Accessing localStorage throws when storage is blocked.
    return unsavedChoice;
  }
}

function osPrefersLight(): boolean {
  try {
    return window.matchMedia(OS_LIGHT_QUERY).matches;
  } catch {
    // No matchMedia (old browsers, tests): treat as no preference.
    return false;
  }
}

/** Sets `data-theme` on <html>, as the inline script in layout.tsx does before first paint. */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", resolveTheme(readChoice(), osPrefersLight()));
}

function setChoice(choice: ThemeChoice) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Blocked or full storage: the choice lasts for this page view only.
    unsavedChoice = choice;
  }
  applyTheme();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  // Another tab changing the choice fires `storage` here.
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The stored choice: System on the server and during hydration, then what storage holds. */
function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, readChoice, () => "system" as const);
}

/**
 * Keeps `data-theme` on <html> in step with the stored choice, and follows the OS live while it is System.
 * Mounted once from the layout, so this works on every page, whether or not the toggle is on it. Renders nothing.
 */
export function ThemeSync() {
  const choice = useThemeChoice();

  useLayoutEffect(() => {
    // Reads storage itself rather than `choice`, which is still System during hydration. Also restores the
    // attribute React clears from <html> on the Strict Mode remount in development.
    applyTheme();
    if (choice !== "system") return;
    let query: MediaQueryList;
    try {
      query = window.matchMedia(OS_LIGHT_QUERY);
    } catch {
      return;
    }
    query.addEventListener("change", applyTheme);
    return () => query.removeEventListener("change", applyTheme);
  }, [choice]);

  return null;
}

/** System / Light / Dark radios. The choice is saved per browser; ThemeSync applies it and follows the OS. */
export function ThemeToggle() {
  const choice = useThemeChoice();

  return (
    <fieldset className="inline-flex rounded-md border border-zinc-700 p-0.5 text-sm">
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map(({ choice: value, label }) => (
        <label
          key={value}
          className="cursor-pointer rounded px-2 py-1 font-medium text-zinc-300 hover:text-amber-300 has-checked:bg-amber-400/15 has-checked:text-amber-200 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-amber-400"
        >
          <input
            type="radio"
            name="theme"
            value={value}
            checked={choice === value}
            onChange={() => setChoice(value)}
            className="sr-only"
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
