import { LANGUAGES, LANGUAGE_NAMES, browseHref, type BrowseState } from "@/lib/catalog/browse-params";
import { Pill } from "./browse-controls";

interface LanguageFilterProps {
  state: BrowseState;
}

/**
 * Original language pills: one language at a time, or Any. A pill starts again from page 1 and keeps every other
 * filter; the selected language's pill keeps it selected, and Any clears it.
 */
export function LanguageFilter({ state }: LanguageFilterProps) {
  return (
    <nav aria-label="Language">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Pill href={browseHref({ ...state, language: undefined, page: 1 })} active={state.language === undefined}>
            Any
          </Pill>
        </li>
        {LANGUAGES.map((language) => (
          <li key={language}>
            <Pill href={browseHref({ ...state, language, page: 1 })} active={state.language === language}>
              {LANGUAGE_NAMES[language]}
            </Pill>
          </li>
        ))}
      </ul>
    </nav>
  );
}
