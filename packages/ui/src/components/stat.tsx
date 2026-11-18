"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight } from "lucide-react";
import { useId, type ComponentPropsWithRef, type ReactNode } from "react";

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

export interface StatProps extends Omit<
  ComponentPropsWithRef<"div">,
  "children" | "onClick" | "title"
> {
  label: ReactNode;
  /** A number is formatted with the UiLabels locale ("1.284"); any other node is shown as given. */
  value: ReactNode;
  /** Secondary line: a unit, a period, a comparison. */
  hint?: ReactNode;
  delta?: StatDelta;
  /** Line icon shown in a soft circle in the category colour (the artboard's "Kehadiran 96%" tile). */
  icon?: ReactNode;
  /** Tints the icon circle; `green` (the accent hue) by default. The name the other components use for `category`. */
  tone?: StatCategory;
  /** The first name for `tone`; still honoured, `tone` wins when both are set. */
  category?: StatCategory;
  /** `plain` (default) has no surface; `tile` is the card tile; `compact` is an item of a strip. Inside a StatGrid the grid's variant decides. */
  appearance?: StatAppearance;
  /** Counts a numeric `value` up once on first render (320ms), unless motion is reduced. */
  countUp?: boolean | Omit<UseCountUpOptions, "decimals">;
  /** Formats a numeric `value` (and each step of the count) instead of the UiLabels locale. */
  formatValue?: (value: number) => string;
  /** Holds the value's place with a skeleton until the number is known. */
  loading?: boolean;
  /** Makes the whole stat a link; the label is the link text. With `onClick` too, both run. */
  href?: string;
  /** Makes the whole stat a button, or runs before a link's navigation when `href` is set. */
  onClick?: () => void;
  /**
   * The stat is a filter and this one is on (a row of tiles that narrow a
   * list below them). A button stat says so with `aria-pressed`, a link
   * with `aria-current`; both draw the selected ring. Leave it out for a
   * stat that is not a toggle, so it is not announced as one.
   */
  selected?: boolean;
}

function hasContent(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== "";
}

// Tile: the artboard's 16px padding, 104px minimum height and radius 20.
// Compact: one strip cell, the icon pinned left of a value-over-label pair.
// Cells share the row equally when every figure fits (a zero basis, so
// the dividers fall evenly whatever the label lengths), and a cell is
// never narrower than its figure and label (`min-w-max`), so a label
// cannot cross the divider and a row that does not fit scrolls. Figures
// start at the top, so values line up when only some cells carry a hint.
const ROOT_CLASS: Record<StatAppearance, string> = {
  plain: "flex flex-col",
  tile: "flex min-h-26 flex-col rounded-lg border border-border bg-surface p-4 shadow-1",
  compact: "relative flex min-w-max flex-[1_0_0%] snap-start flex-col justify-start py-3 pr-5 pl-4",
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
 * The value as shown, and whether it is mid-count. A number is always
 * formatted the same way, so turning the count on never changes the text
 * it settles on. Figures are tabular only while counting, so the digits do
 * not jitter; at rest a lone display number keeps Manrope's proportional
 * figures, whose tabular "1" opens a gap ("1 0", "0/ 1") that reads as a
 * typo at this size.
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
  if (numeric === null) return { node: value, counting: false };
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
  selected,
  describedBy,
  children,
}: Pick<StatProps, "href" | "onClick" | "selected"> & {
  describedBy: string;
  children: ReactNode;
}) {
  const className =
    "outline-none after:absolute after:inset-0 after:rounded-[inherit] after:content-['']";
  if (href !== undefined) {
    return (
      <UiLink
        href={href}
        onClick={onClick}
        data-stat-target=""
        aria-describedby={describedBy}
        aria-current={selected === true ? "true" : undefined}
        className={className}
      >
        {children}
      </UiLink>
    );
  }
  return (
    <button
      type="button"
      data-stat-target=""
      aria-describedby={describedBy}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(className, "text-left")}
    >
      {children}
    </button>
  );
}

// The selected ring follows the accent (the tenant's colour too): a tile
// doubles its border with a ring, so it reads as chosen at a glance next
// to its neighbours; a strip cell or a plain figure takes the selected
// state layer, as a chosen row does.
const SELECTED_CLASS: Record<StatAppearance, string> = {
  plain: "bg-state-selected hover:bg-state-selected",
  tile: "border-accent ring-1 ring-accent hover:border-accent",
  compact: "bg-state-selected hover:bg-state-selected",
};

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
  tone,
  category,
  appearance,
  countUp,
  formatValue,
  loading = false,
  href,
  onClick,
  selected,
  className,
  ...props
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
  // A cell of a short strip sits two to a row on a phone: it takes its
  // column's width and wraps its label instead of growing to it.
  const paired = compact && grid.pairsOnPhone;
  const hasFooter = hasContent(hint) || delta !== undefined;

  return (
    <div
      {...props}
      data-selected={selected === true ? "" : undefined}
      className={cn(
        ROOT_CLASS[look],
        compact && Boolean(icon) && "pl-15",
        paired && "max-sm:min-w-0 max-sm:pr-3",
        // The stretched target is the only focusable element, so the ring
        // goes on the whole stat instead of on the label text.
        interactive &&
          "relative cursor-pointer has-[[data-stat-target]:focus-visible]:outline-2 has-[[data-stat-target]:focus-visible]:outline-offset-2 has-[[data-stat-target]:focus-visible]:outline-focus-ring",
        // A tile is a clickable card (lift and press); a strip cell or a
        // plain figure behaves like a table row (a state layer, no press).
        interactive &&
          look === "tile" &&
          "motion-press hover:border-border-strong/40 hover:shadow-2",
        interactive &&
          look === "compact" &&
          "transition-colors hover:bg-state-hover has-[[data-stat-target]:focus-visible]:-outline-offset-2",
        interactive &&
          look === "plain" &&
          "-m-2 rounded-md p-2 transition-colors hover:bg-state-hover",
        selected === true && SELECTED_CLASS[look],
        className,
      )}
    >
      {/* A strip cell grows to its label instead of cutting it: the strip
          scrolls. A paired cell on a phone wraps it onto a second line. */}
      <Term
        className={cn(
          "order-2 text-fg-muted",
          compact
            ? cn("text-caption", paired ? "sm:whitespace-nowrap" : "whitespace-nowrap")
            : "text-body-sm",
        )}
      >
        {interactive ? (
          <StatTarget
            href={href}
            onClick={onClick}
            selected={selected}
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
            // The strip centres it on a spanning cell's one-line figure.
            data-stat-icon=""
            tone={tone ?? category ?? "green"}
            size={compact ? "sm" : "md"}
            className={cn(
              !compact && "size-9.5",
              // Centred on the value-over-label pair (12px padding, then
              // 22 + 16px of lines around the 32px circle), so it stays
              // beside the figure when a hint or a wrapped label makes
              // the cell taller.
              compact && "absolute top-3.75 left-4",
              // A positioned circle paints above the stretched target and
              // would swallow the click; let it fall through to the target.
              interactive && "pointer-events-none",
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
        {/* "Go to" only for a tile that leads somewhere: a button tile is
            a filter or an action in place, and a chevron would promise a
            page that never opens. */}
        {href !== undefined && look === "tile" && (
          <ChevronRight
            className="pointer-events-none absolute top-4 right-4 size-4 text-fg-muted"
            aria-hidden="true"
          />
        )}
      </Detail>
      {/* The hint is smaller than the label it qualifies, so it is also
          no heavier: the caption role at 400 instead of its 500. Only the
          change keeps a weight of its own. Full width, so it keeps a line
          of its own under a spanning strip cell's one-line figure. */}
      {hasFooter && (
        <Detail
          id={hintId}
          className="order-3 mt-0.5 flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 text-caption font-normal text-fg-muted"
        >
          {delta && <DeltaText delta={delta} />}
          {hint}
        </Detail>
      )}
    </div>
  );
}
