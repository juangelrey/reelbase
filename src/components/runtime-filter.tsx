import { RUNTIMES, browseHref, type BrowseState } from "@/lib/catalog/browse-params";
import { Pill } from "./browse-controls";

interface RuntimeFilterProps {
  state: BrowseState;
}

/**
 * Maximum runtime pills: one runtime at a time, or Any. A pill starts again from page 1 and keeps every other filter;
 * the selected runtime's pill keeps it selected, and Any clears it.
 */
export function RuntimeFilter({ state }: RuntimeFilterProps) {
  return (
    <nav aria-label="Runtime">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Pill href={browseHref({ ...state, runtime: undefined, page: 1 })} active={state.runtime === undefined}>
            Any
          </Pill>
        </li>
        {RUNTIMES.map((runtime) => (
          <li key={runtime}>
            <Pill href={browseHref({ ...state, runtime, page: 1 })} active={state.runtime === runtime}>
              Under {runtime} min
            </Pill>
          </li>
        ))}
      </ul>
    </nav>
  );
}
