import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "../utils/cn.js";

export interface StatProps {
  label: string;
  value: ReactNode;
  /** Secondary line under the number: a unit, a period, a comparison. */
  hint?: string;
  className?: string;
}

/**
 * One labelled number inside a StatGrid. Values carry tabular figures so a
 * row of them keeps its digits on the same vertical rails (DESIGN.md
 * typography).
 */
export function Stat({ label, value, hint, className }: StatProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <dt className="text-[12px] text-fg-muted">{label}</dt>
      <dd className="flex flex-col gap-0.5">
        <span className="text-[20px] leading-tight font-medium tabular-nums text-fg">{value}</span>
        {hint && <span className="text-[12px] text-fg-muted">{hint}</span>}
      </dd>
    </div>
  );
}

export type StatGridProps = ComponentPropsWithoutRef<"dl">;

/** Holds Stat children; override the column count through `className`. */
export function StatGrid({ className, ...props }: StatGridProps) {
  return <dl className={cn("grid grid-cols-2 gap-4 sm:grid-cols-4", className)} {...props} />;
}
