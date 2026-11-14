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
 * - `narrow`: up to 720px, the page scrolls. Forms, settings.
 * - `fit`: up to 1440px and exactly as tall as the viewport from 768px up;
 *   the content area takes the remaining height and scrolls inside itself
 *   (a table with a sticky head, a class list beside its roster).
 */
export type PageShellVariant = "default" | "wide" | "narrow" | "fit";

const WIDTH: Record<PageShellVariant, string> = {
  default: "max-w-default",
  wide: "max-w-wide",
  narrow: "max-w-narrow",
  fit: "max-w-wide",
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
 * the page, 0 by default) from the viewport height; the app sets it once
 * for its own header.
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
      className={cn(
        "flex w-full min-w-0 flex-col px-4 py-4 md:px-6 md:py-6",
        fit && "md:h-[calc(100dvh-var(--page-offset-top,0px))]",
        className,
      )}
      {...props}
    >
      <div
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
