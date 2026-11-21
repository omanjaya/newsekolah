"use client";

import { ChevronRight } from "lucide-react";
import { Fragment, useId, type ComponentPropsWithRef, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

import { useListContext } from "./list.js";
import { UiLink } from "./ui-link.js";

export interface ListRowProps extends Omit<ComponentPropsWithRef<"li">, "title" | "onClick"> {
  /** An Avatar, an IconCircle, or a short fixed-width value such as a time. */
  leading?: ReactNode;
  title: ReactNode;
  /**
   * How many lines the title may take before it ends in an ellipsis: 1
   * (default) for scannable rows, 2 for long names on a phone, such as a
   * book title.
   */
  titleLines?: 1 | 2;
  /**
   * The secondary line under the title, up to two lines. An array is a
   * list of short facts (a day, "keluar 15.49", a count) joined with " · ":
   * the line wraps only between facts, never inside one, and a fact wider
   * than the row ends in an ellipsis instead of being cut mid-word.
   */
  meta?: ReactNode | readonly ReactNode[];
  /**
   * How many lines the meta may take: 2 (default), or 3 to 5 for a row
   * whose facts each need a line of their own (whom a visitor came to see,
   * since when, the badge they wear), so none of them is cut to make room.
   * 4 leaves a long name room to wrap onto a second line on a phone; 5
   * adds a status line (a warning Badge) that has no room beside them.
   */
  metaLines?: 2 | 3 | 4 | 5;
  /**
   * Keeps every fact of an array `meta` (a date, a request time) whole,
   * whatever the locale makes of their length: the row's text never
   * narrows below its widest fact (up to the row's own width), and when
   * that width and the trailing slot (a status Badge) do not fit on one
   * line, the trailing slot moves under the text instead of a fact or the
   * badge being cut. The title asks for 8rem there, never for its whole
   * length: pair it with `titleLines={2}` for a long name. Meant for two or
   * three short facts: the meta line still holds two lines.
   */
  keepMetaWhole?: boolean;
  /**
   * A value, date or Badge at the end of the row. A child hidden at some
   * width (`hidden sm:inline`) leaves no gap behind there. It keeps its
   * width; with `keepMetaWhole` it moves under the text when the row is
   * out of room.
   */
  trailing?: ReactNode;
  /** A separate control (a menu, a button); it stays its own target above the row's. */
  action?: ReactNode;
  /** Makes the whole row a link; the title is the link text. With `onClick` too, both run. */
  href?: string;
  /** Makes the whole row a button, or runs before a link's navigation when `href` is set. */
  onClick?: () => void;
  /** The trailing chevron; on by default for a row that opens something and has no `action`. */
  chevron?: boolean;
  /** The current item of a master-detail list. */
  selected?: boolean;
  disabled?: boolean;
}

/*
 * A lone icon button in the action slot (a row menu: an accessible name
 * and nothing but an icon) is set like the chevron of the rows around it:
 * pulled right by its own padding, so its 16px glyph is centred where the
 * chevron's is (8px into a 32px box, 14px into the 44px touch box), and as
 * muted as the chevron until it is hovered or its menu is open. A button
 * with text keeps its box on the content edge and its own colour.
 *
 * The pull never exceeds the row's own inset (`--list-inset`), the
 * padding it pulls into: in a list with no inset the button would stick
 * out past the list's edge, make the list scroll sideways, and focusing
 * it would scroll the start of every row out of view.
 */
const ICON_ACTION_CLASS =
  "[&>button[aria-label]:has(>svg:only-child)]:-mr-[min(--spacing(2),var(--list-inset))] " +
  "pointer-coarse:[&>button[aria-label]:has(>svg:only-child)]:-mr-[min(--spacing(3.5),var(--list-inset))] " +
  "[&>button[aria-label]:has(>svg:only-child)]:text-fg-muted " +
  "[&>button[aria-label]:has(>svg:only-child):hover]:text-fg " +
  "[&>button[aria-label]:has(>svg:only-child)[aria-expanded=true]]:text-fg";

// The target fills the row through its ::after, so a click anywhere opens
// it, while an `action` (lifted above with `relative z-10`) keeps its own.
const TARGET_CLASS =
  "outline-none after:absolute after:inset-0 after:content-[''] disabled:cursor-not-allowed";

function RowTarget({
  href,
  onClick,
  selected,
  disabled,
  describedBy,
  titleLines,
  children,
}: Pick<ListRowProps, "href" | "onClick" | "selected" | "disabled"> & {
  describedBy: string | undefined;
  titleLines: 1 | 2;
  children: ReactNode;
}) {
  const current = selected ? ("true" as const) : undefined;
  // The title is cut inside the target itself. The truncating paragraph
  // around it cannot draw the ellipsis: a link or button there is one
  // inline box that is clipped whole, mid-word ("Puskesmas, k"). As a
  // block of the row's width the target ends its own line in the ellipsis
  // (or its second line, for two). Its ::after hangs off the row, not the
  // target, so the clipping leaves the row-wide hit area intact.
  const fit = titleLines === 2 ? "line-clamp-2" : "block w-full truncate";
  if (href !== undefined && !disabled) {
    return (
      <UiLink
        href={href}
        onClick={onClick}
        data-list-row-target=""
        aria-current={current}
        aria-describedby={describedBy}
        className={cn(TARGET_CLASS, fit)}
      >
        {children}
      </UiLink>
    );
  }
  return (
    <button
      type="button"
      data-list-row-target=""
      aria-current={current}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={onClick}
      className={cn(TARGET_CLASS, "text-left", fit)}
    >
      {children}
    </button>
  );
}

/** Short facts joined with " · ", each kept on one line. */
function presentSegments(segments: readonly ReactNode[]): ReactNode[] {
  return segments.filter(
    (segment) => segment !== null && segment !== undefined && segment !== false && segment !== "",
  );
}

/**
 * Each fact is its own one-line box: the line wraps between facts, and a
 * fact wider than the row shrinks to it and ends in an ellipsis
 * (`truncate` on the fact, bottom-aligned to sit on the line). The " ·"
 * after a fact rides in the fact's box and never shrinks, so a wrapped
 * line ends in the separator instead of the next line opening with it.
 */
function MetaSegments({ segments }: { segments: readonly ReactNode[] }) {
  const present = presentSegments(segments);
  return present.map((segment, index) => {
    const last = index === present.length - 1;
    return (
      // The facts are a fixed, ordered list for this row; the index is their identity.
      <Fragment key={index}>
        <span data-meta-fact="" className="inline-flex max-w-full align-bottom">
          <span className="min-w-0 truncate">{segment}</span>
          {!last && <span className="shrink-0 whitespace-pre"> ·</span>}
        </span>
        {!last && " "}
      </Fragment>
    );
  });
}

/** Whole class names, so Tailwind finds each one in the source. */
const META_LINE_CLAMP = {
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
  5: "line-clamp-5",
} as const;

/**
 * One row of a List: leading avatar or icon circle, title, meta line,
 * trailing value, and an action or a chevron. A row with `href` or
 * `onClick` is one target with hover, pressed and focus state layers; its
 * text links and buttons stay separate targets.
 */
export function ListRow({
  leading,
  title,
  titleLines = 1,
  meta,
  metaLines = 2,
  keepMetaWhole = false,
  trailing,
  action,
  href,
  onClick,
  chevron,
  selected = false,
  disabled = false,
  className,
  ...props
}: ListRowProps) {
  const { variant, dense } = useListContext();
  const metaId = useId();
  const hasMeta = Array.isArray(meta) ? presentSegments(meta).length > 0 : Boolean(meta);
  const interactive = href !== undefined || onClick !== undefined;
  const showChevron = chevron ?? (interactive && !action && !disabled);
  const rule = "border-b border-line";
  // Only a list of facts has facts to keep whole.
  const keepFacts = keepMetaWhole && Array.isArray(meta) && hasMeta;

  const text = (
    // With `keepMetaWhole` the text asks for its min-content width but
    // never more than the row, then grows into the rest of its line; where
    // that width and the trailing slot do not fit side by side, the slot
    // wraps under the text. The min-content is the widest fact (each fact
    // is one unbreakable box) or the title's 8rem, whichever is wider: the
    // title asks for room for a short name (two lines of it with
    // `titleLines={2}`), never for its whole length, and is stretched back
    // to the column.
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.5",
        keepFacts ? "w-min max-w-full grow" : "flex-1",
      )}
    >
      <p
        className={cn(
          "text-fg",
          titleLines === 2 ? "line-clamp-2 [overflow-wrap:anywhere]" : "truncate",
          dense ? "text-label" : "text-body font-semibold",
          keepFacts && "w-32 max-w-full min-w-full",
        )}
      >
        {interactive ? (
          <RowTarget
            href={href}
            onClick={onClick}
            selected={selected}
            disabled={disabled}
            describedBy={hasMeta ? metaId : undefined}
            titleLines={titleLines}
          >
            {title}
          </RowTarget>
        ) : (
          title
        )}
      </p>
      {hasMeta && (
        <div
          id={metaId}
          className={cn(
            META_LINE_CLAMP[metaLines],
            "text-fg-muted",
            dense ? "text-caption" : "text-body-sm",
          )}
        >
          {Array.isArray(meta) ? <MetaSegments segments={meta} /> : meta}
        </div>
      )}
    </div>
  );

  const trailingSlot = trailing && (
    // No box of its own (display: contents): each child is an item of the
    // row, so one hidden at some width (`hidden sm:inline`) takes the row's
    // gap away with it instead of leaving an empty 12px box. Text styles
    // still inherit; the children keep their width (a status Badge is never
    // cut) and sit 8px apart, as they did inside a box.
    <div
      data-slot="list-row-trailing"
      className="contents text-caption whitespace-nowrap text-fg-muted tabular-nums *:shrink-0 [&>*+*]:-ml-1"
    >
      {trailing}
    </div>
  );

  return (
    <li
      className={cn(
        "group/row relative flex items-center gap-3 pl-(--list-inset) transition-colors",
        variant === "divided" && cn(rule, "last:border-b-0"),
        dense && "pointer-coarse:min-h-11",
        selected && "bg-state-selected",
        interactive &&
          !disabled &&
          "cursor-pointer hover:bg-state-hover has-[[data-list-row-target]:active]:bg-state-pressed",
        // The focus ring sits inside the row, rounded to the control radius
        // so a first or last row's ring is not cut by the list's corners.
        interactive &&
          "has-[[data-list-row-target]:focus-visible]:rounded-md has-[[data-list-row-target]:focus-visible]:outline-2 has-[[data-list-row-target]:focus-visible]:-outline-offset-2 has-[[data-list-row-target]:focus-visible]:outline-focus-ring",
        disabled && "opacity-50",
        className,
      )}
      {...props}
    >
      {leading && <div className="flex shrink-0 items-center">{leading}</div>}
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 pr-(--list-inset)",
          dense ? "py-2" : "py-3",
          variant === "inset" && cn(rule, "group-last/row:border-b-0"),
        )}
      >
        {keepMetaWhole ? (
          // The text and the trailing slot share a line while both fit;
          // otherwise the trailing slot wraps under the text, whole.
          <div
            data-slot="list-row-body"
            className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1"
          >
            {text}
            {trailingSlot}
          </div>
        ) : (
          <>
            {text}
            {trailingSlot}
          </>
        )}
        {action && (
          <div
            data-slot="list-row-action"
            className={cn("relative z-10 flex shrink-0 items-center", ICON_ACTION_CLASS)}
          >
            {action}
          </div>
        )}
        {showChevron && (
          <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
        )}
      </div>
    </li>
  );
}
