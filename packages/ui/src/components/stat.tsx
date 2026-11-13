"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight } from "lucide-react";
import { useId, type ReactNode } from "react";

import { useCountUp, type UseCountUpOptions } from "../hooks/use-count-up.js";
import { cn } from "../utils/cn.js";

import { IconCircle } from "./icon-circle.js";
import { Skeleton } from "./skeleton.js";
import { StatGrid, useStatGrid, type StatAppearance, type StatGridProps } from "./stat-grid.js";
import type { CategoryTone } from "./tone.js";
import { useUiLabels } from "./ui-labels.js";
import { UiLink } from "./ui-link.js";

export { StatGrid, type StatAppearance, type StatGridProps };
export type { StatGridVariant } from "./stat-grid.js";

export type StatCategory = CategoryTone;

export interface StatDelta {
  /** The change as written, e.g. "+4%" or "2 dari kemarin". */
  value: string;
  direction: "up" | "down" | "flat";
  /** Defaults to `success` for up, `danger` for down; pass it when down is the good news. */
  tone?: "success" | "danger" | "neutral";
}

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  /** Secondary line: a unit, a period, a comparison. */
  hint?: ReactNode;
  delta?: StatDelta;
  /** Line icon shown in a soft circle in the category colour (the artboard's "Kehadiran 96%" tile). */
  icon?: ReactNode;
  /** Tints the icon circle; `green` (the accent hue) by default. */
  category?: StatCategory;
  /** `plain` (default) has no surface; `tile` is the card tile; `compact` is an item of a strip. Inside a StatGrid the grid's variant decides. */
  appearance?: StatAppearance;
  /** Counts a numeric `value` up once on first render (320ms), unless motion is reduced. */
  countUp?: boolean | Omit<UseCountUpOptions, "decimals">;
  /** Formats a numeric `value` (and each step of the count); defaults to the UiLabels locale. */
  formatValue?: (value: number) => string;
  /** Holds the value's place with a skeleton until the number is known. */
  loading?: boolean;
  /** Makes the whole stat a link; the label is the link text. */
  href?: string;
  /** Makes the whole stat a button. */
  onClick?: () => void;
  className?: string;
}

// Tile: the artboard's 16px padding, 104px minimum height and radius 20.
// Compact: one strip cell, the icon pinned left of a value-over-label pair.
const ROOT_CLASS: Record<StatAppearance, string> = {
  plain: "flex flex-col",
  tile: "flex min-h-26 flex-col rounded-lg border border-border bg-surface p-4 shadow-1",
  compact: "relative flex min-w-36 flex-1 flex-col justify-center py-3 pr-5 pl-4",
};

const VALUE_CLASS: Record<StatAppearance, string> = {
  plain: "text-title-lg",
  tile: "text-title-lg",
  compact: "text-heading",
};

const DELTA_TONE_CLASS = {
  success: "text-success",
  danger: "text-danger",
  neutral: "text-fg-muted",
} as const;

const DELTA_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const;

function DeltaText({ delta }: { delta: StatDelta }) {
  const labels = useUiLabels();
  const Icon = DELTA_ICON[delta.direction];
  const tone =
    delta.tone ??
    (delta.direction === "up" ? "success" : delta.direction === "down" ? "danger" : "neutral");
  const spoken = {
    up: labels.statDeltaUp,
    down: labels.statDeltaDown,
    flat: labels.statDeltaFlat,
  }[delta.direction];
  // Plain inline text with the arrow as its first glyph, so a change that
  // wraps on a phone keeps the arrow on its first line.
  return (
    <span className={cn("text-caption font-semibold", DELTA_TONE_CLASS[tone])}>
      <Icon className="mr-0.5 inline size-3.5 align-[-0.15em]" aria-hidden="true" />
      <span className="sr-only">{spoken} </span>
      {delta.value}
    </span>
  );
}

/**
 * The value as shown, and whether it is mid-count. Figures are tabular only
 * while counting, so the digits do not jitter; at rest a lone display
 * number keeps Manrope's proportional figures, whose tabular "1" opens a
 * gap ("1 0", "0/ 1") that reads as a typo at this size.
 */
function useDisplayValue(
  value: ReactNode,
  countUp: StatProps["countUp"],
  formatValue: StatProps["formatValue"],
): { node: ReactNode; counting: boolean } {
  const labels = useUiLabels();
  const numeric = typeof value === "number" ? value : null;
  const options = typeof countUp === "object" ? countUp : {};
  const counted = useCountUp(numeric ?? 0, {
    ...options,
    enabled: Boolean(countUp) && numeric !== null && options.enabled !== false,
  });
  if (numeric === null || (!countUp && !formatValue)) return { node: value, counting: false };
  const shown = countUp ? counted : numeric;
  const node = formatValue
    ? formatValue(shown)
    : new Intl.NumberFormat(labels.locale).format(shown);
  return { node, counting: shown !== numeric };
}

/** The stretched link or button that makes the whole stat its target. */
function StatTarget({
  href,
  onClick,
  describedBy,
  children,
}: Pick<StatProps, "href" | "onClick"> & { describedBy: string; children: ReactNode }) {
  const className =
    "outline-none after:absolute after:inset-0 after:rounded-[inherit] after:content-['']";
  if (href !== undefined) {
    return (
      <UiLink href={href} data-stat-target="" aria-describedby={describedBy} className={className}>
        {children}
      </UiLink>
    );
  }
  return (
    <button
      type="button"
      data-stat-target=""
      aria-describedby={describedBy}
      onClick={onClick}
      className={cn(className, "text-left")}
    >
      {children}
    </button>
  );
}

/**
 * One labelled figure: icon in a soft category circle, the value on the
 * `title-lg` role (tabular while it counts up), a muted label, and an optional
 * hint and change. Inside a StatGrid it is a `dt`/`dd` group of the grid's
 * `dl` (label first in reading order, value first on screen); on its own
 * it is plain text. One component behind both `Stat` and `StatTile`.
 */
export function Stat({
  label,
  value,
  hint,
  delta,
  icon,
  category = "green",
  appearance,
  countUp,
  formatValue,
  loading = false,
  href,
  onClick,
  className,
}: StatProps) {
  const grid = useStatGrid();
  const look: StatAppearance = appearance ?? grid.appearance ?? "plain";
  const Term = grid.inList ? "dt" : "div";
  const Detail = grid.inList ? "dd" : "div";
  const valueId = useId();
  const hintId = useId();
  const shown = useDisplayValue(value, countUp, formatValue);
  const interactive = href !== undefined || onClick !== undefined;
  const compact = look === "compact";
  const hasFooter = hint !== undefined || delta !== undefined;

  return (
    <div
      className={cn(
        ROOT_CLASS[look],
        compact && Boolean(icon) && "pl-15",
        // The stretched target is the only focusable element, so the ring
        // goes on the whole stat instead of on the label text.
        interactive &&
          "relative cursor-pointer has-[[data-stat-target]:focus-visible]:outline-2 has-[[data-stat-target]:focus-visible]:outline-offset-2 has-[[data-stat-target]:focus-visible]:outline-focus-ring",
        // A tile is a clickable card (lift and press); a strip cell or a
        // plain figure behaves like a table row (a state layer, no press).
        interactive && look === "tile" && "motion-press hover:shadow-2",
        interactive &&
          look === "compact" &&
          "transition-colors hover:bg-state-hover has-[[data-stat-target]:focus-visible]:-outline-offset-2",
        interactive &&
          look === "plain" &&
          "-m-2 rounded-md p-2 transition-colors hover:bg-state-hover",
        className,
      )}
    >
      {/* A strip cell grows to its label instead of cutting it: the strip scrolls. */}
      <Term
        className={cn(
          "order-2 text-fg-muted",
          compact ? "text-caption whitespace-nowrap" : "text-body-sm",
        )}
      >
        {interactive ? (
          <StatTarget
            href={href}
            onClick={onClick}
            describedBy={hasFooter ? `${valueId} ${hintId}` : valueId}
          >
            {label}
          </StatTarget>
        ) : (
          label
        )}
      </Term>
      <Detail id={valueId} className={cn("order-1 flex flex-col", !compact && "gap-3.5")}>
        {icon && (
          <IconCircle
            tone={category}
            size={compact ? "sm" : "md"}
            className={cn(
              !compact && "size-9.5",
              compact && "absolute top-1/2 left-4 -translate-y-1/2",
            )}
          >
            {icon}
          </IconCircle>
        )}
        {loading ? (
          <Skeleton className={cn("rounded-sm", compact ? "h-5.5 w-10" : "my-0.5 h-6 w-14")} />
        ) : (
          <span className={cn(VALUE_CLASS[look], "text-fg", shown.counting && "tabular-nums")}>
            {shown.node}
          </span>
        )}
        {interactive && look === "tile" && (
          <ChevronRight
            className="absolute top-4 right-4 size-4 text-fg-muted"
            aria-hidden="true"
          />
        )}
      </Detail>
      {hasFooter && (
        <Detail
          id={hintId}
          className="order-3 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-fg-muted"
        >
          {delta && <DeltaText delta={delta} />}
          {hint}
        </Detail>
      )}
    </div>
  );
}
