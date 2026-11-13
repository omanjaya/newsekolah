"use client";

import { SearchX } from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "./button.js";
import { EmptyState, type EmptyStateVariant } from "./empty-state.js";
import { useUiLabels } from "./ui-labels.js";

export interface FilteredEmptyStateProps {
  /** Clears the search and filters; without it the state has no button. */
  onReset?: () => void;
  title?: string;
  description?: string;
  resetLabel?: string;
  variant?: EmptyStateVariant;
  className?: string;
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
  variant,
  className,
}: FilteredEmptyStateProps): ReactElement {
  const labels = useUiLabels();
  return (
    <EmptyState
      icon={<SearchX />}
      title={title ?? labels.emptyFilteredTitle}
      description={description ?? labels.emptyFilteredDescription}
      variant={variant}
      className={className}
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
