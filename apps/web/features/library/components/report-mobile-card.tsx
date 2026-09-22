import type { ReactElement, ReactNode } from "react";

/**
 * Phone fallback for the hand-rolled report tables in this feature. The
 * shared DataTable already swaps its table for a card list below `md`; these
 * report tables are bespoke, so they reuse this small card + label/value row
 * to get the same stacked-on-mobile treatment instead of a sideways scroll.
 * Pair each list with a `hidden md:block` table for wider screens.
 */
export function ReportCard({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="rounded-sm border border-border bg-surface p-3 text-[13px]">{children}</div>
  );
}

export function ReportCardTitle({ children }: { children: ReactNode }): ReactElement {
  return <p className="mb-1.5 font-medium text-fg">{children}</p>;
}

export function ReportField({ label, value }: { label: string; value: ReactNode }): ReactElement {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="shrink-0 text-fg-muted">{label}</span>
      <span className="min-w-0 break-words text-right text-fg">{value}</span>
    </div>
  );
}
