import type { ComponentPropsWithRef, ReactElement, ReactNode } from "react";

import { cn } from "../utils/cn.js";

/**
 * The bar's own width (a container size, never the screen's) from which
 * its controls share a row: `sm` 24rem, `md` 28rem, `lg` 32rem, `xl`
 * 36rem, `2xl` 42rem, `3xl` 48rem.
 */
export type FilterBarRowFrom = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";

interface RowFromClasses {
  /** The control row: a column below the size, a wrapping row from it. */
  bar: string;
  /** The search's share of the row: at least 12rem, at most 20rem. */
  search: string;
}

/*
 * Whole class names per size, so Tailwind finds each one in the source.
 * Below the size every control is stretched (`*:w-full`, over the width a
 * control sets for the row); from it each keeps its own width and the row
 * wraps, so a control that does not fit moves to the next line whole
 * instead of being squeezed or clipped.
 */
const ROW_FROM: Record<FilterBarRowFrom, RowFromClasses> = {
  sm: {
    bar: "@max-sm/filter-bar:*:w-full @sm/filter-bar:flex-row @sm/filter-bar:flex-wrap @sm/filter-bar:items-center",
    search: "@sm/filter-bar:min-w-48 @sm/filter-bar:flex-1 @sm/filter-bar:max-w-80",
  },
  md: {
    bar: "@max-md/filter-bar:*:w-full @md/filter-bar:flex-row @md/filter-bar:flex-wrap @md/filter-bar:items-center",
    search: "@md/filter-bar:min-w-48 @md/filter-bar:flex-1 @md/filter-bar:max-w-80",
  },
  lg: {
    bar: "@max-lg/filter-bar:*:w-full @lg/filter-bar:flex-row @lg/filter-bar:flex-wrap @lg/filter-bar:items-center",
    search: "@lg/filter-bar:min-w-48 @lg/filter-bar:flex-1 @lg/filter-bar:max-w-80",
  },
  xl: {
    bar: "@max-xl/filter-bar:*:w-full @xl/filter-bar:flex-row @xl/filter-bar:flex-wrap @xl/filter-bar:items-center",
    search: "@xl/filter-bar:min-w-48 @xl/filter-bar:flex-1 @xl/filter-bar:max-w-80",
  },
  "2xl": {
    bar: "@max-2xl/filter-bar:*:w-full @2xl/filter-bar:flex-row @2xl/filter-bar:flex-wrap @2xl/filter-bar:items-center",
    search: "@2xl/filter-bar:min-w-48 @2xl/filter-bar:flex-1 @2xl/filter-bar:max-w-80",
  },
  "3xl": {
    bar: "@max-3xl/filter-bar:*:w-full @3xl/filter-bar:flex-row @3xl/filter-bar:flex-wrap @3xl/filter-bar:items-center",
    search: "@3xl/filter-bar:min-w-48 @3xl/filter-bar:flex-1 @3xl/filter-bar:max-w-80",
  },
};

export interface FilterBarProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  /** The search box (a `SearchInput`), first in the bar. */
  search?: ReactNode;
  /**
   * The filters after it: a `SegmentedControl`, a `Select`, the pills of
   * `DataTableFilters`. Each sets its width for the row with plain classes
   * (`w-56`; `ml-auto` to sit at the row's end, `grow` to take the rest),
   * never a screen breakpoint: below `rowFrom` the bar stretches them.
   */
  children?: ReactNode;
  /** The bar's own width from which its controls share a row. Default `xl` (36rem). */
  rowFrom?: FilterBarRowFrom;
}

/**
 * A search and the filters that act on one list, laid out by the room the
 * bar really has (a container query), not by the screen's width. Beside
 * the 240px sidebar a tablet's column is narrower than a large phone's
 * screen, and a toolbar that turned into a row at 640px of screen put a
 * 288px search beside a filter strip in a 480px column: the strip got
 * 180px and hid "Terjadwal" past its edge.
 *
 * Below `rowFrom` of its own width the controls stack, each the bar's
 * full width (a segmented filter's segments share it, as on a phone).
 * From it they share a row: the search takes 12 to 20rem of it, every
 * other control its own width, and a control with no room left moves to
 * the next line whole. Pick `rowFrom` near the width the row needs (a
 * 12rem search, the filters, 8px between each) so the bar stacks rather
 * than wraps.
 *
 * Its width comes from its parent (a container cannot size itself by its
 * content), so it fills the line it sits on.
 */
export function FilterBar({
  search,
  children,
  rowFrom = "xl",
  className,
  ...props
}: FilterBarProps): ReactElement {
  const layout = ROW_FROM[rowFrom];
  return (
    <div
      data-slot="filter-bar"
      className={cn("@container/filter-bar w-full min-w-0", className)}
      {...props}
    >
      <div data-slot="filter-bar-row" className={cn("flex flex-col gap-2", layout.bar)}>
        {search !== undefined && search !== null && typeof search !== "boolean" && (
          <div data-slot="filter-bar-search" className={cn("min-w-0", layout.search)}>
            {search}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
