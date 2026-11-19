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
   * the line wraps only between facts, never inside one.
   */
  meta?: ReactNode | readonly ReactNode[];
  /**
   * A value, date or Badge at the end of the row. A child hidden at some
   * width (`hidden sm:inline`) leaves no gap behind there.
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
 */
const ICON_ACTION_CLASS =
  "[&>button[aria-label]:has(>svg:only-child)]:-mr-2 " +
  "pointer-coarse:[&>button[aria-label]:has(>svg:only-child)]:-mr-3.5 " +
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
  clamp,
  children,
}: Pick<ListRowProps, "href" | "onClick" | "selected" | "disabled"> & {
  describedBy: string | undefined;
  /** Clamps the title inside the target itself (a button is its own box). */
  clamp: boolean;
  children: ReactNode;
}) {
  const current = selected ? ("true" as const) : undefined;
  if (href !== undefined && !disabled) {
    return (
      <UiLink
        href={href}
        onClick={onClick}
        data-list-row-target=""
        aria-current={current}
        aria-describedby={describedBy}
        className={cn(TARGET_CLASS, clamp && "line-clamp-2")}
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
      className={cn(TARGET_CLASS, "text-left", clamp && "line-clamp-2")}
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

function MetaSegments({ segments }: { segments: readonly ReactNode[] }) {
  return presentSegments(segments).map((segment, index) => (
    // The facts are a fixed, ordered list for this row; the index is their identity.
    <Fragment key={index}>
      {index > 0 && " · "}
      <span className="whitespace-nowrap">{segment}</span>
    </Fragment>
  ));
}

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
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p
            className={cn(
              "text-fg",
              titleLines === 2 ? "line-clamp-2 [overflow-wrap:anywhere]" : "truncate",
              dense ? "text-label" : "text-body font-semibold",
            )}
          >
            {interactive ? (
              <RowTarget
                href={href}
                onClick={onClick}
                selected={selected}
                disabled={disabled}
                describedBy={hasMeta ? metaId : undefined}
                clamp={titleLines === 2}
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
              className={cn("line-clamp-2 text-fg-muted", dense ? "text-caption" : "text-body-sm")}
            >
              {Array.isArray(meta) ? <MetaSegments segments={meta} /> : meta}
            </div>
          )}
        </div>
        {trailing && (
          // No box of its own (display: contents): each child is an item
          // of the row, so one hidden at some width (`hidden sm:inline`)
          // takes the row's gap away with it instead of leaving an empty
          // 12px box. Text styles still inherit; the children keep their
          // width and sit 8px apart, as they did inside a box.
          <div
            data-slot="list-row-trailing"
            className="contents text-caption whitespace-nowrap text-fg-muted tabular-nums *:shrink-0 [&>*+*]:-ml-1"
          >
            {trailing}
          </div>
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
