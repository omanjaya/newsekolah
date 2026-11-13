"use client";

import { ChevronRight } from "lucide-react";
import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

import { useListContext } from "./list.js";
import { UiLink } from "./ui-link.js";

export interface ListRowProps extends Omit<ComponentPropsWithoutRef<"li">, "title" | "onClick"> {
  /** An Avatar, an IconCircle, or a short fixed-width value such as a time. */
  leading?: ReactNode;
  title: ReactNode;
  /** The secondary line under the title, up to two lines. */
  meta?: ReactNode;
  /** A value, date or Badge at the end of the row. */
  trailing?: ReactNode;
  /** A separate control (a menu, a button); it stays its own target above the row's. */
  action?: ReactNode;
  /** Makes the whole row a link; the title is the link text. */
  href?: string;
  /** Makes the whole row a button. */
  onClick?: () => void;
  /** The trailing chevron; on by default for a row that opens something and has no `action`. */
  chevron?: boolean;
  /** The current item of a master-detail list. */
  selected?: boolean;
  disabled?: boolean;
}

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
  children,
}: Pick<ListRowProps, "href" | "onClick" | "selected" | "disabled"> & {
  describedBy: string | undefined;
  children: ReactNode;
}) {
  const current = selected ? ("true" as const) : undefined;
  if (href !== undefined && !disabled) {
    return (
      <UiLink
        href={href}
        data-list-row-target=""
        aria-current={current}
        aria-describedby={describedBy}
        className={TARGET_CLASS}
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
      className={cn(TARGET_CLASS, "text-left")}
    >
      {children}
    </button>
  );
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
          <p className={cn("truncate text-fg", dense ? "text-label" : "text-body font-semibold")}>
            {interactive ? (
              <RowTarget
                href={href}
                onClick={onClick}
                selected={selected}
                disabled={disabled}
                describedBy={meta ? metaId : undefined}
              >
                {title}
              </RowTarget>
            ) : (
              title
            )}
          </p>
          {meta && (
            <div
              id={metaId}
              className={cn("line-clamp-2 text-fg-muted", dense ? "text-caption" : "text-body-sm")}
            >
              {meta}
            </div>
          )}
        </div>
        {trailing && (
          <div className="flex shrink-0 items-center gap-2 text-caption text-fg-muted tabular-nums">
            {trailing}
          </div>
        )}
        {action && <div className="relative z-10 flex shrink-0 items-center">{action}</div>}
        {showChevron && (
          <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
        )}
      </div>
    </li>
  );
}
