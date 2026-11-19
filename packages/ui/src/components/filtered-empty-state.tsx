"use client";

import { SearchX } from "lucide-react";
import { createContext, useContext, type MouseEvent, type ReactElement } from "react";

import { Button } from "./button.js";
import { EmptyState, type EmptyStateProps } from "./empty-state.js";
import { useUiLabels } from "./ui-labels.js";

export interface FilteredEmptyStateProps extends Omit<
  EmptyStateProps,
  "title" | "icon" | "action"
> {
  /** Clears the search and filters; without it the state has no button. */
  onReset?: () => void;
  title?: string;
  resetLabel?: string;
  /**
   * Whether the list has a search box. Without one the default hint only
   * speaks of filters, never of "another keyword" the reader cannot type.
   * Defaults to true.
   */
  searchable?: boolean;
}

/**
 * Set by a list whose search and filter controls stay on the page (a
 * DataTable's toolbar). The reset takes this empty state, and its own
 * button, away, so it is called first to move focus to one of those
 * controls rather than let it drop to <body>.
 */
export const FilteredResetFocusContext = createContext<
  ((event: MouseEvent<HTMLButtonElement>) => void) | null
>(null);

/**
 * The "nothing matches" preset: a list that is empty because of its search
 * or filters, not because nothing exists yet. Its way forward is resetting
 * them; the copy comes from UiLabels unless the screen has a better word.
 */
export function FilteredEmptyState({
  onReset,
  title,
  description,
  resetLabel,
  searchable = true,
  ...props
}: FilteredEmptyStateProps): ReactElement {
  const labels = useUiLabels();
  const handOffFocus = useContext(FilteredResetFocusContext);
  return (
    <EmptyState
      {...props}
      icon={<SearchX />}
      title={title ?? labels.emptyFilteredTitle}
      description={
        description ??
        (searchable ? labels.emptyFilteredDescription : labels.emptyFilteredFiltersOnlyDescription)
      }
      action={
        onReset && (
          <Button
            variant="secondary"
            size="sm"
            onClick={(event) => {
              handOffFocus?.(event);
              onReset();
            }}
          >
            {resetLabel ?? labels.emptyFilteredReset}
          </Button>
        )
      }
    />
  );
}
