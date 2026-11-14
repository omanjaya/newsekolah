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
  ...props
}: FilteredEmptyStateProps): ReactElement {
  const labels = useUiLabels();
  return (
    <EmptyState
      {...props}
      icon={<SearchX />}
      title={title ?? labels.emptyFilteredTitle}
      description={description ?? labels.emptyFilteredDescription}
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
