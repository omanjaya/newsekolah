"use client";

import { createContext, useContext, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

import { CARD_FLUSH_CLASS, useCardContext } from "./card-context.js";
import { useUiLabels } from "./ui-labels.js";

export type DataListLayout = "inline" | "stacked";

const DataListContext = createContext<DataListLayout>("inline");

const COLUMNS_CLASS = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
} as const;

export interface DataListProps extends ComponentPropsWithoutRef<"dl"> {
  /**
   * `inline` (default): label beside value on rows divided by a rule, label
   * above value on a phone. `stacked`: label above value in a grid of
   * `columns`, for a summary block.
   */
  layout?: DataListLayout;
  /** Columns of a stacked list from 640px up. */
  columns?: 1 | 2 | 3;
}

/**
 * Key and value details (a student's NIS, class, homeroom teacher) as a
 * real definition list: each item is one `div` holding exactly one `dt`
 * and one `dd`, the only grouping a `dl` allows. Inside a Card an inline
 * list spans the card and lines up with its header.
 */
export function DataList({ layout = "inline", columns = 2, className, ...props }: DataListProps) {
  const card = useCardContext();
  return (
    <DataListContext.Provider value={layout}>
      <dl
        data-card-flush={layout === "inline" ? "" : undefined}
        className={cn(
          layout === "inline"
            ? cn("flex flex-col", card && CARD_FLUSH_CLASS[card.padding])
            : cn("grid grid-cols-1 gap-x-6 gap-y-4", COLUMNS_CLASS[columns]),
          className,
        )}
        {...props}
      />
    </DataListContext.Provider>
  );
}

export interface DataListItemProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  label: ReactNode;
  /** The value; empty, `null` or `undefined` shows a dash, read out as "no value". */
  children?: ReactNode;
  /** A muted line under the value. */
  hint?: ReactNode;
  /** In a stacked grid, takes the full row (an address, a note). */
  fullWidth?: boolean;
}

function isEmpty(value: ReactNode): boolean {
  return value === undefined || value === null || value === false || value === "";
}

export function DataListItem({
  label,
  children,
  hint,
  fullWidth,
  className,
  ...props
}: DataListItemProps) {
  const layout = useContext(DataListContext);
  const labels = useUiLabels();
  const inline = layout === "inline";
  return (
    <div
      className={cn(
        inline
          ? "grid grid-cols-1 gap-0.5 border-b border-line px-(--list-inset,0px) py-3 last:border-b-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-baseline sm:gap-4"
          : "flex min-w-0 flex-col gap-1",
        !inline && fullWidth && "sm:col-span-full",
        className,
      )}
      {...props}
    >
      <dt className="text-body-sm text-fg-muted">{label}</dt>
      <dd className="flex min-w-0 flex-col gap-0.5 text-body text-fg [overflow-wrap:anywhere]">
        {isEmpty(children) ? (
          <div>
            <span aria-hidden="true" className="text-fg-muted">
              –
            </span>
            <span className="sr-only">{labels.dataListNoValue}</span>
          </div>
        ) : (
          <div className="min-w-0">{children}</div>
        )}
        {hint && <span className="text-caption text-fg-muted">{hint}</span>}
      </dd>
    </div>
  );
}
