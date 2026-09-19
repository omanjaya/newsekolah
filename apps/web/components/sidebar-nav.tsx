"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@newsekolah/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { navGroupIcons, type NavItem } from "../lib/navigation";

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Shows the label as a tooltip only while the sidebar is a rail and the text is hidden. */
export function RailLabel({
  label,
  enabled,
  children,
}: {
  label: string;
  enabled: boolean;
  children: ReactNode;
}): ReactElement {
  if (!enabled) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function NavLink({
  item,
  rail,
  animate,
  delayMs,
  nested,
}: {
  item: NavItem;
  rail: boolean;
  animate: boolean;
  /** Staggers this row in when its group opens, so the list unfolds instead of appearing at once. */
  delayMs: number;
  /** Inside a group, where the active marker lands on the guide rule rather than the row edge. */
  nested: boolean;
}): ReactElement {
  const pathname = usePathname();
  const t = useTranslations();
  const active = isActive(pathname, item.href);
  const label = t(item.labelKey);

  return (
    <RailLabel label={label} enabled={rail}>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        title={rail ? undefined : label}
        className={cn(
          // shrink-0 is load-bearing: the nav is a flex column, so `h-9` is a
          // height a flex child will happily be squeezed below. Without it,
          // opening a group compresses every row instead of scrolling the
          // list, and a 36px row renders at 20px.
          "group/link relative flex h-9 shrink-0 items-center gap-3 rounded-sm px-3 text-[13px]",
          animate &&
            "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
          // Colour carries the state, but never alone: the active row is also
          // the only one at full text weight and full foreground colour.
          // TenantProvider writes a single accent for both themes, so on a
          // dark surface the school's colour can fall under the contrast
          // floor -- a tint is safe to lean on, a label colour is not.
          active
            ? "bg-accent/12 font-medium text-fg"
            : "text-fg-muted hover:bg-accent/8 hover:text-fg active:bg-accent/15",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            // Nested rows put the marker on top of the group's guide rule, so
            // the rule itself turns accent for the page you are on.
            "absolute top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent",
            nested ? "-left-2" : "left-0",
            animate &&
              "transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)]",
            active ? "scale-y-100" : "scale-y-0",
          )}
        />
        <item.icon className="size-5 shrink-0" aria-hidden="true" />
        <span
          className={cn(
            "truncate",
            animate &&
              "transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-standard)]",
            rail ? "-translate-x-1 opacity-0" : "translate-x-0 opacity-100",
          )}
          style={animate && !rail ? { transitionDelay: `${delayMs}ms` } : undefined}
        >
          {label}
        </span>
      </Link>
    </RailLabel>
  );
}

/** How long the flyout survives the pointer leaving, so a diagonal sweep into it does not close it. */
const FLYOUT_CLOSE_DELAY_MS = 180;

/**
 * One group as a single rail icon that opens its pages in a flyout.
 *
 * The rail cannot list items directly: `domainIcons` maps one glyph per
 * concept, so the library group alone would be fifteen identical books with
 * no labels (see navGroupIcons). A group icon plus a labelled panel keeps
 * every destination reachable and the rail one screen tall.
 */
export function GroupFlyout({
  group,
  items,
  animate,
  rail = true,
}: {
  group: string;
  items: NavItem[];
  animate: boolean;
  rail?: boolean;
}): ReactElement {
  const t = useTranslations();
  const pathname = usePathname();

  // Open is derived, not stored: the panel belongs to the route it was
  // opened on, so following a link inside it closes it with no effect and no
  // setState during the click. Closing from the click itself aborts the
  // navigation -- Radix unmounts the portal before Next commits the route.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;

  function setOpen(next: boolean) {
    setOpenedAt(next ? pathname : null);
  }

  const closeTimer = useRef<number | null>(null);
  // Hover must not pull focus out of wherever the reader was; a click or a
  // keypress must. Radix cannot tell them apart, so the trigger records it.
  const openedByHover = useRef(false);

  const label = t(group);
  const Icon = navGroupIcons[group];
  const hasActivePage = items.some((item) => isActive(pathname, item.href));

  function cancelClose() {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function closeSoon() {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
    }, FLYOUT_CLOSE_DELAY_MS);
  }

  useEffect(() => cancelClose, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onMouseEnter={() => {
            if (!rail) return;
            openedByHover.current = true;
            cancelClose();
            setOpen(true);
          }}
          onMouseLeave={rail ? closeSoon : undefined}
          onPointerDown={() => {
            openedByHover.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") openedByHover.current = false;
          }}
          className={cn(
            "relative flex h-9 shrink-0 items-center gap-3 rounded-sm px-3 text-[13px]",
            rail && "justify-center",
            animate &&
              "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
            hasActivePage || open
              ? "bg-accent/12 text-fg"
              : "text-fg-muted hover:bg-accent/8 hover:text-fg active:bg-accent/15",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent",
              animate &&
                "transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)]",
              hasActivePage ? "scale-y-100" : "scale-y-0",
            )}
          />
          {Icon ? <Icon className="size-5 shrink-0" aria-hidden="true" /> : null}
          {!rail && <span className="truncate">{label}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        collisionPadding={8}
        onOpenAutoFocus={(event) => {
          if (openedByHover.current) event.preventDefault();
        }}
        onMouseEnter={cancelClose}
        onMouseLeave={rail ? closeSoon : undefined}
        className="flex max-h-[80vh] w-56 flex-col gap-0.5 overflow-y-auto p-2"
      >
        <p className="px-3 pt-1 pb-2 text-[12px] font-medium text-fg-muted">{label}</p>
        {items.map((item) => (
          <NavLink
            key={item.key}
            item={item}
            rail={false}
            animate={animate}
            delayMs={0}
            nested={false}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}
