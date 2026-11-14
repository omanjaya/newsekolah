"use client";

import {
  forwardRef,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from "react";

import { useActiveIndicator } from "../hooks/use-active-indicator.js";
import { useScrollEdges } from "../hooks/use-scroll-edges.js";
import { cn } from "../utils/cn.js";

import {
  StripCount,
  stripIndicatorClass,
  stripItemClass,
  stripScrollerClass,
  stripTrackClass,
  type StripSize,
  type StripVariant,
} from "./tab-styles.js";

export interface NavTabsItem {
  href: string;
  label: string;
  /** Marks the page the reader is on. The caller decides (nested routes, a view shown under another route). */
  current?: boolean;
  /** A count after the label, e.g. items waiting on that page. */
  count?: number;
  /** A Lucide icon before the label, sized for you. */
  icon?: ReactNode;
}

/** What `renderLink` must put on the element it renders. */
export interface NavTabsLinkProps {
  href: string;
  className: string;
  "aria-current": "page" | undefined;
  children: ReactNode;
}

/** Any other `<nav>` attribute (`id`, `data-*`) lands on the landmark, as on `TabsList`. */
export interface NavTabsProps extends Omit<
  ComponentPropsWithoutRef<"nav">,
  "children" | "aria-label"
> {
  /** Names the navigation landmark, e.g. "Bagian presensi". */
  "aria-label": string;
  items: NavTabsItem[];
  /**
   * Renders one link. Defaults to a plain `<a>`; apps/web passes its router
   * link so navigation stays client-side:
   * `renderLink={(props) => <Link {...props} />}`.
   */
  renderLink?: (props: NavTabsLinkProps, item: NavTabsItem) => ReactNode;
  /** "pill" (default) or "underline", the same looks as `TabsList`. */
  variant?: StripVariant;
  size?: StripSize;
  /** Stretch across the container, the links sharing the width equally. */
  fullWidth?: boolean;
  className?: string;
}

const ACTIVE_COUNT =
  "group-aria-[current=page]/tab:bg-accent-soft group-aria-[current=page]/tab:text-accent-soft-fg";

function defaultLink({
  href,
  className,
  "aria-current": current,
  children,
}: NavTabsLinkProps): ReactNode {
  return (
    <a href={href} className={className} aria-current={current}>
      {children}
    </a>
  );
}

/**
 * Sub-navigation between the pages of one section ("Hari ini / Jadwal
 * kerja / Rekap"), drawn exactly like `Tabs` but made of links: each item
 * is its own URL with its own history entry, and the current one carries
 * `aria-current="page"`. Use it under the page header, never `Tabs`
 * without panels (which points `aria-controls` at panels that do not
 * exist). A single item renders nothing: a lone tab only repeats the
 * page title.
 */
export const NavTabs = forwardRef<HTMLElement, NavTabsProps>(function NavTabs(props, ref) {
  if (props.items.length < 2) return null;
  return <NavTabsStrip ref={ref} {...props} />;
});

/** Mounts with its elements, so the scroll and indicator hooks always find them. */
const NavTabsStrip = forwardRef<HTMLElement, NavTabsProps>(function NavTabsStrip(
  {
    "aria-label": ariaLabel,
    items,
    renderLink = defaultLink,
    variant = "pill",
    size = "md",
    fullWidth = false,
    className,
    ...props
  },
  ref,
): ReactElement {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  useScrollEdges(scrollerRef, { axis: "x" });
  useActiveIndicator(scrollerRef, indicatorRef, '[aria-current="page"]');

  return (
    <nav
      ref={ref}
      aria-label={ariaLabel}
      className={cn(stripTrackClass(variant, fullWidth), className)}
      {...props}
    >
      <div ref={scrollerRef} data-strip="" className={stripScrollerClass(variant)}>
        <span ref={indicatorRef} aria-hidden="true" className={stripIndicatorClass(variant)} />
        <ul className={cn("flex", fullWidth && "flex-1", variant === "underline" && "gap-1")}>
          {items.map((item) => (
            <li key={item.href} className={cn("flex", fullWidth && "flex-1")}>
              {renderLink(
                {
                  href: item.href,
                  "aria-current": item.current ? "page" : undefined,
                  className: cn(
                    "group/tab",
                    stripItemClass(variant, size, fullWidth),
                    "aria-[current=page]:text-fg",
                    variant === "pill"
                      ? [
                          "[[data-strip]:not([data-indicator=ready])_&]:aria-[current=page]:bg-surface-raised [[data-strip]:not([data-indicator=ready])_&]:aria-[current=page]:shadow-1",
                          "not-aria-[current=page]:hover:bg-state-hover not-aria-[current=page]:active:bg-state-pressed",
                        ]
                      : [
                          "[[data-strip]:not([data-indicator=ready])_&]:aria-[current=page]:shadow-[inset_0_-2px_0_var(--color-accent)]",
                          "not-aria-[current=page]:hover:bg-state-hover not-aria-[current=page]:active:bg-state-pressed",
                        ],
                  ),
                  children: (
                    <>
                      {item.icon !== undefined && (
                        <span className="flex shrink-0" aria-hidden="true">
                          {item.icon}
                        </span>
                      )}
                      {item.label}
                      {item.count !== undefined && (
                        <StripCount
                          count={item.count}
                          variant={variant}
                          activeClassName={ACTIVE_COUNT}
                        />
                      )}
                    </>
                  ),
                },
                item,
              )}
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
});
