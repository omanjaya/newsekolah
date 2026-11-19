"use client";

import { SearchX } from "lucide-react";
import type { ReactElement } from "react";

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
          <Button variant="secondary" size="sm" onClick={onReset}>
            {resetLabel ?? labels.emptyFilteredReset}
          </Button>
        )
      }
    />
  );
}
