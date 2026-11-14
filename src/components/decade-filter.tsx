import { DECADES, browseHref, type BrowseState } from "@/lib/catalog/browse-params";
import { Pill } from "./browse-controls";

interface DecadeFilterProps {
  state: BrowseState;
}

/**
 * Decade pills: one decade at a time, or All. A pill starts again from page 1 and keeps every other filter; the
 * selected decade's pill keeps it selected, and All clears it.
 */
export function DecadeFilter({ state }: DecadeFilterProps) {
  return (
    <nav aria-label="Decade">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Pill href={browseHref({ ...state, decade: undefined, page: 1 })} active={state.decade === undefined}>
            All
          </Pill>
        </li>
        {DECADES.map((decade) => (
          <li key={decade}>
            <Pill href={browseHref({ ...state, decade, page: 1 })} active={state.decade === decade}>
              {decade}s
            </Pill>
          </li>
        ))}
      </ul>
    </nav>
  );
}
