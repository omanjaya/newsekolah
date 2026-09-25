import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "../utils/cn.js";

export type StatCategory = "green" | "amber" | "purple" | "blue" | "red";

const ICON_CIRCLE_CLASS: Record<StatCategory, string> = {
  green: "bg-category-green-soft text-category-green",
  amber: "bg-category-amber-soft text-category-amber",
  purple: "bg-category-purple-soft text-category-purple",
  blue: "bg-category-blue-soft text-category-blue",
  red: "bg-category-red-soft text-category-red",
};

export interface StatProps {
  label: string;
  value: ReactNode;
  /** Secondary line under the number: a unit, a period, a comparison. */
  hint?: string;
  /** Icon shown in a soft-tinted circle above the number, as in the "Hijau Segar" tile (docs/07-ui-ux.md). */
  icon?: ReactNode;
  /** Tints the icon circle. Defaults to `green` (the accent hue) when `icon` is set. */
  category?: StatCategory;
  className?: string;
}

/**
 * One labelled number, optionally as a card tile with an icon-in-soft-circle
 * above it (the mockup's "Kehadiran 96%" pattern). The number is Manrope,
 * tabular so a row of them keeps its digits on the same vertical rails.
 */
export function Stat({ label, value, hint, icon, category = "green", className }: StatProps) {
  return (
    <div className={cn("flex flex-col gap-3.5", className)}>
      {icon && (
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full [&>svg]:size-5",
            ICON_CIRCLE_CLASS[category],
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <div className="flex flex-col gap-0.5">
        <dt className="order-2 text-[13px] text-fg-muted">{label}</dt>
        <dd className="order-1 flex flex-col gap-0.5">
          <span className="font-heading text-[22px] leading-tight font-bold tracking-tight tabular-nums text-fg">
            {value}
          </span>
          {hint && <span className="text-[12px] text-fg-muted">{hint}</span>}
        </dd>
      </div>
    </div>
  );
}

export type StatGridProps = ComponentPropsWithoutRef<"dl">;

/** Holds Stat children; override the column count through `className`. */
export function StatGrid({ className, ...props }: StatGridProps) {
  return <dl className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)} {...props} />;
}
