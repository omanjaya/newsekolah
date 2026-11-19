"use client";

import { CloudOff, Inbox, RotateCw } from "lucide-react";
import { isValidElement, type MouseEvent, type ReactElement, type ReactNode } from "react";

import { Alert } from "../alert.js";
import { Button } from "../button.js";
import { EmptyState, EmptyStateInlineScope } from "../empty-state.js";
import { FilteredEmptyState, FilteredResetFocusContext } from "../filtered-empty-state.js";
import { IconCircle } from "../icon-circle.js";
import { useUiLabels, type UiLabels } from "../ui-labels.js";

/**
 * The empty slot of the table body. The table's card (or, on a phone, the
 * slot's own card) is already the frame, so an `EmptyState` inside renders
 * its `inline` variant: no second border, the inline icon and spacing. A
 * `FilteredEmptyState` inside calls `onResetFocus` before its reset, which
 * takes the slot away with the button in it.
 */
export function DataTableEmptySlot({
  children,
  onResetFocus,
}: {
  children: ReactNode;
  onResetFocus?: (event: MouseEvent<HTMLButtonElement>) => void;
}): ReactElement {
  return (
    <div data-slot="data-table-empty" className="flex flex-col justify-center">
      <FilteredResetFocusContext.Provider value={onResetFocus ?? null}>
        <EmptyStateInlineScope>{children}</EmptyStateInlineScope>
      </FilteredResetFocusContext.Provider>
    </div>
  );
}

/** What an empty table says when its caller gave no `emptyState`. */
export function DataTableDefaultEmptyState(): ReactElement {
  const labels = useUiLabels();
  return <EmptyState icon={<Inbox />} title={labels.tableEmptyTitle} />;
}

/** Reads a stable `code` off an API error object, for the support line. */
function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code !== "" ? code : undefined;
}

/**
 * What the failure line says: the caller's own words (a string or an
 * element, never an Error's raw message), else the reason the app maps from
 * the error (`UiLabels.tableErrorReason`, e.g. an API code's catalog text),
 * else the generic connection hint.
 */
function errorDescription(error: unknown, labels: UiLabels): ReactNode {
  if (typeof error === "string" && error !== "") return error;
  if (isValidElement(error)) return error;
  return labels.tableErrorReason(error) ?? labels.tableErrorDescription;
}

export interface DataTableErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  /** While a retry is in flight. */
  retrying?: boolean;
}

/**
 * A failed load, said as one: what happened, what to do, a retry button and
 * a small code for support (docs/07-ui-ux.md section 5). It replaces the
 * rows when there are none to show, so a failure never reads as "no data
 * yet"; it has the inline empty state's measure, so the two sit alike.
 */
export function DataTableErrorState({
  error,
  onRetry,
  retrying,
}: DataTableErrorStateProps): ReactElement {
  const labels = useUiLabels();
  const code = errorCode(error);
  return (
    <div
      role="alert"
      data-slot="data-table-error"
      className="flex flex-col items-center gap-4 px-6 py-8 text-center"
    >
      <IconCircle tone="danger">
        <CloudOff />
      </IconCircle>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-heading text-fg">{labels.tableErrorTitle}</p>
        <p className="text-body-sm text-fg-muted">{errorDescription(error, labels)}</p>
        {code && <p className="mt-1 text-caption text-fg-muted">{labels.tableErrorCode(code)}</p>}
      </div>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          icon={<RotateCw />}
          loading={retrying}
          onClick={onRetry}
        >
          {labels.tableRetry}
        </Button>
      )}
    </div>
  );
}

/**
 * A failed refresh of a table that still shows rows: the rows stay (they
 * are the last good answer) and a danger alert above them says the list
 * may be out of date, with the same retry.
 */
export function DataTableErrorAlert({
  error,
  onRetry,
  retrying,
}: DataTableErrorStateProps): ReactElement {
  const labels = useUiLabels();
  const code = errorCode(error);
  return (
    <Alert
      variant="danger"
      data-slot="data-table-error"
      title={labels.tableErrorTitle}
      action={
        onRetry && (
          <Button
            variant="secondary"
            size="sm"
            icon={<RotateCw />}
            loading={retrying}
            onClick={onRetry}
          >
            {labels.tableRetry}
          </Button>
        )
      }
    >
      <p>{errorDescription(error, labels)}</p>
      {code && <p className="text-caption">{labels.tableErrorCode(code)}</p>}
    </Alert>
  );
}

/** "No results" for a local search, with the way back: the shared filtered preset. */
export function DataTableSearchEmptyState({
  title,
  description,
  clearLabel,
  onClear,
}: {
  title: string;
  description: string;
  clearLabel: string;
  onClear: () => void;
}): ReactElement {
  return (
    <FilteredEmptyState
      title={title}
      description={description}
      resetLabel={clearLabel}
      onReset={onClear}
    />
  );
}
