import { CloudOff, RotateCw } from "lucide-react";
import { isValidElement, type ReactElement, type ReactNode } from "react";

import { cn } from "../../utils/cn.js";
import { Button } from "../button.js";
import { useUiLabels } from "../ui-labels.js";

/**
 * Strips the frame off whatever empty state a caller passes, so an
 * `EmptyState` (which draws its own dashed border) sits inside the
 * table's card instead of drawing a second card within it.
 */
const FRAMELESS = "[&>*]:rounded-none [&>*]:border-0 [&>*]:bg-transparent [&>*]:shadow-none";

/** The empty slot of the table body: frameless, centred in the card. */
export function DataTableEmptySlot({ children }: { children: ReactNode }): ReactElement {
  return (
    <div data-slot="data-table-empty" className={cn("flex flex-col justify-center", FRAMELESS)}>
      {children}
    </div>
  );
}

/** Reads a stable `code` off an API error object, for the support line. */
function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code !== "" ? code : undefined;
}

/** A caller's own words for the failure: a string or an element, never an Error's raw message. */
function errorDescription(error: unknown): ReactNode {
  if (typeof error === "string" && error !== "") return error;
  if (isValidElement(error)) return error;
  return undefined;
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
 * rows, so a failure never reads as "no data yet".
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
      className="flex flex-col items-center gap-4 px-6 py-10 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger [&>svg]:size-6"
      >
        <CloudOff />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-heading text-fg">{labels.tableErrorTitle}</p>
        <p className="text-body-sm text-fg-muted">
          {errorDescription(error) ?? labels.tableErrorDescription}
        </p>
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

/** "No results" for a local search, with the way back. */
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
    <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
      <div className="flex flex-col gap-1">
        <p className="text-heading text-fg">{title}</p>
        <p className="text-body-sm text-fg-muted">{description}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onClear}>
        {clearLabel}
      </Button>
    </div>
  );
}
