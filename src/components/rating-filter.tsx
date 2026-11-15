import { RATINGS, browseHref, type BrowseState } from "@/lib/catalog/browse-params";
import { Pill } from "./browse-controls";

interface RatingFilterProps {
  state: BrowseState;
}

/**
 * Minimum rating pills: one rating at a time, or Any. A pill starts again from page 1 and keeps every other filter;
 * the selected rating's pill keeps it selected, and Any clears it.
 */
export function RatingFilter({ state }: RatingFilterProps) {
  return (
    <nav aria-label="Rating">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Pill href={browseHref({ ...state, rating: undefined, page: 1 })} active={state.rating === undefined}>
            Any
          </Pill>
        </li>
        {RATINGS.map((rating) => (
          <li key={rating}>
            <Pill href={browseHref({ ...state, rating, page: 1 })} active={state.rating === rating}>
              {rating}+
            </Pill>
          </li>
        ))}
      </ul>
    </nav>
  );
}
