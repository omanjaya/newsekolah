"use client";

import {
  isValidElement,
  type ComponentPropsWithRef,
  type ReactElement,
  type ReactNode,
} from "react";

import { cn } from "../utils/cn.js";

import { Breadcrumb, type BreadcrumbItem } from "./breadcrumb.js";

/**
 * How wide the page runs and how it scrolls:
 * - `default`: up to 1200px, the page scrolls. Lists, detail pages.
 * - `wide`: up to 1440px, the page scrolls. Dashboards, wide grids.
 * - `narrow`: content (toolbar and body) up to 720px, the page scrolls.
 *   Forms, settings. The head (trail, header, sub-navigation) keeps the
 *   default column and the content sits at its left edge, so a narrow
 *   page's title and tabs do not jump sideways from a default sibling's.
 * - `fit`: up to 1440px and exactly as tall as the viewport from 768px up;
 *   the content area takes the remaining height and scrolls inside itself
 *   (a table with a sticky head, a class list beside its roster).
 */
export type PageShellVariant = "default" | "wide" | "narrow" | "fit";

/** The page column: the head's width, and the content's unless narrowed below. */
const WIDTH: Record<PageShellVariant, string> = {
  default: "max-w-default",
  wide: "max-w-wide",
  narrow: "max-w-default",
  fit: "max-w-wide",
};

/** The content's own cap inside the column, left-aligned under the head. */
const CONTENT_WIDTH: Partial<Record<PageShellVariant, string>> = {
  narrow: "w-full max-w-narrow",
};

export interface PageShellProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  variant?: PageShellVariant;
  /** The trail above the header: items, or a ready `Breadcrumb`. */
  breadcrumb?: BreadcrumbItem[] | ReactNode;
  /** The page's head, a `PageHeader`. */
  header?: ReactNode;
  /**
   * Sub-navigation between the pages of one area, a `NavTabs`. Always
   * directly under the header; a `NavTabs` of one item renders nothing and
   * leaves no gap behind.
   */
  nav?: ReactNode;
  /** Controls that act on the content (filters, a date switcher, a search), between the head and the content. */
  toolbar?: ReactNode;
  /**
   * Fixed-position elements (a `StickySaveBar`, a floating action). They
   * render outside the entering content: an element that is animating its
   * `transform` becomes the containing block of every fixed descendant.
   */
  floating?: ReactNode;
  /** Plays the content-enter animation when the page mounts. On by default. */
  animate?: boolean;
  /** Classes for the content area (toolbar and children). */
  contentClassName?: string;
  children?: ReactNode;
}

/**
 * The single root of a page (docs/superpowers/specs/2026-11-14-ui-overhaul-design.md
 * section 6): breadcrumb, header, sub-navigation, toolbar and content, in
 * that order, inside a centred column of the variant's width. Pages are
 * padded 16px on a phone and 24px from 768px up, and sections sit 24px
 * apart. The content (not the head) fades and rises in once when the page
 * mounts, so moving between the tabs of one area keeps its title still.
 *
 * The `fit` variant subtracts `--page-offset-top` (the sticky chrome above
 * the page) from the viewport height. Unset, it reads the app shell's
 * measured `--shell-header-height` (header and strips), then 0.
 */
export function PageShell({
  variant = "default",
  breadcrumb,
  header,
  nav,
  toolbar,
  floating,
  animate = true,
  className,
  contentClassName,
  children,
  ...props
}: PageShellProps): ReactElement {
  const fit = variant === "fit";
  const crumbs = Array.isArray(breadcrumb) ? (
    <Breadcrumb items={breadcrumb} />
  ) : isValidElement(breadcrumb) ? (
    breadcrumb
  ) : null;
  const hasHead = crumbs !== null || Boolean(header) || Boolean(nav);

  return (
    <div
      data-page-shell=""
      data-variant={variant}
      // Read by an app's own page transitions (a phone's directional
      // entrance), which skip a shell that plays no entrance.
      data-animate={animate ? "" : undefined}
      className={cn(
        "flex w-full min-w-0 flex-col px-4 py-4 md:px-6 md:py-6",
        fit && "md:h-[calc(100dvh-var(--page-offset-top,var(--shell-header-height,0px)))]",
        className,
      )}
      {...props}
    >
      <div
        data-slot="page-column"
        className={cn(
          "mx-auto flex w-full min-w-0 flex-1 flex-col gap-6",
          WIDTH[variant],
          fit && "md:min-h-0",
        )}
      >
        {hasHead && (
          // Hidden when every part rendered nothing (a lone NavTabs item),
          // so an empty head leaves no 24px gap above the content.
          <div
            data-slot="page-head"
            className="flex min-w-0 flex-col gap-4 [&:not(:has(>:not(:empty)))]:hidden"
          >
            {(crumbs !== null || Boolean(header)) && (
              <div className="flex min-w-0 flex-col gap-2">
                {crumbs}
                {header}
              </div>
            )}
            {nav && (
              <div data-slot="page-nav" className="min-w-0 empty:hidden">
                {nav}
              </div>
            )}
          </div>
        )}
        <div
          data-slot="page-content"
          className={cn(
            "flex min-w-0 flex-col gap-4",
            CONTENT_WIDTH[variant],
            fit && "md:min-h-0 md:flex-1",
            animate && "animate-enter",
            contentClassName,
          )}
        >
          {toolbar && (
            <div
              data-slot="page-toolbar"
              className="flex min-w-0 flex-wrap items-center gap-2 empty:hidden"
            >
              {toolbar}
            </div>
          )}
          <div
            data-slot="page-body"
            className={cn("flex min-w-0 flex-col gap-6", fit && "md:min-h-0 md:flex-1")}
          >
            {children}
          </div>
        </div>
      </div>
      {floating}
    </div>
  );
}
