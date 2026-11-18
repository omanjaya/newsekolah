"use client";

import {
  CountBadge,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@newsekolah/ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { navGroupIcons, navGroupLabelKey, type NavItem } from "../lib/navigation";

import { NAV_MARKER_ATTR } from "./use-nav-marker";

/**
 * Where the active marker sits, relative to the list's padding box: in the
 * 12px gutter left of a top-level row, or centred on a group's guide rule
 * (12px list padding plus the 20px indent, minus half the 3px marker).
 */
export const NAV_MARKER_OFFSETS = { top: 4, nested: 31 } as const;

/** One row's frame: 36px, the pill radius, colour changes at the 120ms state pace. */
const ROW =
  "relative flex h-9 shrink-0 items-center rounded-md text-body-sm font-medium outline-none transition-colors focus-visible:-outline-offset-2";
const ROW_IDLE_TOP = "text-fg hover:bg-state-hover active:bg-state-pressed";
const ROW_IDLE_NESTED = "text-fg-muted hover:bg-state-hover hover:text-fg active:bg-state-pressed";
const ROW_ACTIVE = "bg-accent-soft font-semibold text-accent-soft-fg";

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
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/** The label beside an icon; it fades out as the sidebar narrows to a rail. */
export function RowLabel({ rail, children }: { rail: boolean; children: ReactNode }): ReactElement {
  return (
    <span
      className={cn(
        "min-w-0 flex-1 truncate transition-opacity",
        rail ? "pointer-events-none opacity-0" : "opacity-100",
      )}
    >
      {children}
    </span>
  );
}

export type NavRowVariant = "top" | "nested" | "flyout";

/**
 * One destination. Top-level rows carry their icon; rows under a group
 * heading (nested, or in a rail flyout) do not, since the group's icon
 * already names them and repeating one glyph per row says nothing.
 */
export function NavRow({
  item,
  variant,
  rail = false,
  activeHref,
  onNavigate,
}: {
  item: NavItem;
  variant: NavRowVariant;
  rail?: boolean;
  /** The single best-matching href across the whole menu (see `activeNavHref`). */
  activeHref: string | undefined;
  onNavigate?: () => void;
}): ReactElement {
  const t = useTranslations();
  const active = item.href === activeHref;
  const label = t(item.labelKey);
  const shown = variant === "top" ? label : t(item.groupLabelKey ?? item.labelKey);
  const count = item.badgeCount ?? 0;

  return (
    <RailLabel label={label} enabled={rail}>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        aria-label={rail || shown !== label ? label : undefined}
        onClick={onNavigate}
        {...(active && variant !== "flyout" ? { [NAV_MARKER_ATTR]: variant } : {})}
        className={cn(
          ROW,
          variant === "top" ? "gap-3 px-2.5" : "px-3",
          active ? ROW_ACTIVE : variant === "top" ? ROW_IDLE_TOP : ROW_IDLE_NESTED,
        )}
      >
        {variant === "top" && (
          <item.icon
            aria-hidden="true"
            className={cn(
              "size-5 shrink-0 transition-colors",
              active ? "text-accent-soft-fg" : "text-fg-muted",
            )}
          />
        )}
        <RowLabel rail={rail}>{shown}</RowLabel>
        {count > 0 &&
          (rail ? (
            <span
              aria-hidden="true"
              className="absolute top-2 left-7 size-2 rounded-full bg-accent ring-2 ring-surface"
            />
          ) : (
            <CountBadge
              count={count}
              tone="accent"
              aria-label={t("app.shell.navBadge", { count })}
            />
          ))}
      </Link>
    </RailLabel>
  );
}

/**
 * A group in the expanded sidebar: a row with the group's icon, as heavy as
 * a top-level link, over its pages on a guide rule. Opening and closing
 * animate the row track (`motion-collapse`); a closed group keeps its rows
 * mounted but inert. When the page being viewed sits inside a closed group,
 * the group row takes the active marker in its place.
 */
export function NavGroup({
  group,
  items,
  open,
  animate,
  activeHref,
  onToggle,
}: {
  group: string;
  items: NavItem[];
  open: boolean;
  animate: boolean;
  activeHref: string | undefined;
  onToggle: () => void;
}): ReactElement {
  const t = useTranslations();
  const panelId = useId();
  const Icon = navGroupIcons[group];
  const holdsActive = items.some((item) => item.href === activeHref);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        {...(holdsActive && !open ? { [NAV_MARKER_ATTR]: "top" } : {})}
        className={cn(
          ROW,
          "w-full gap-3 px-2.5 text-left",
          holdsActive && !open ? ROW_ACTIVE : ROW_IDLE_TOP,
        )}
      >
        {Icon && (
          <Icon
            aria-hidden="true"
            className={cn(
              "size-5 shrink-0 transition-colors",
              holdsActive ? "text-accent-soft-fg" : "text-fg-muted",
            )}
          />
        )}
        <RowLabel rail={false}>{t(navGroupLabelKey(group))}</RowLabel>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-fg-muted",
            animate && "motion-indicator",
            !open && "-rotate-90",
          )}
        />
      </button>
      <div
        id={panelId}
        data-state={open ? "open" : "closed"}
        className={cn("motion-collapse", !animate && "[transition:none]")}
      >
        <div inert={!open}>
          <div className="mt-0.5 mb-1 ml-5 flex flex-col gap-0.5 border-l border-line pl-2">
            {items.map((item) => (
              <NavRow key={item.key} item={item} variant="nested" activeHref={activeHref} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** How long the flyout survives the pointer leaving, so a diagonal sweep into it does not close it. */
const FLYOUT_CLOSE_DELAY_MS = 180;

/**
 * One group as a single rail icon that opens its pages in a flyout panel.
 * Hover opens it without moving focus; a click or a key opens it and moves
 * focus in. A small chevron tells it apart from the rail's plain links,
 * which navigate at once.
 */
export function GroupFlyout({
  group,
  items,
  activeHref,
}: {
  group: string;
  items: NavItem[];
  activeHref: string | undefined;
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

  const label = t(navGroupLabelKey(group));
  const Icon = navGroupIcons[group];
  const holdsActive = items.some((item) => item.href === activeHref);

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
          aria-label={t("app.shell.nav.groupMenu", { group: label })}
          onMouseEnter={() => {
            openedByHover.current = true;
            cancelClose();
            setOpen(true);
          }}
          onMouseLeave={closeSoon}
          onPointerDown={() => {
            openedByHover.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") openedByHover.current = false;
          }}
          {...(holdsActive ? { [NAV_MARKER_ATTR]: "top" } : {})}
          className={cn(
            ROW,
            "w-full gap-3 px-2.5",
            holdsActive ? ROW_ACTIVE : open ? "bg-state-hover text-fg" : ROW_IDLE_TOP,
          )}
        >
          {Icon && (
            <Icon
              aria-hidden="true"
              className={cn(
                "size-5 shrink-0",
                holdsActive ? "text-accent-soft-fg" : "text-fg-muted",
              )}
            />
          )}
          {/* Smaller and 2px out into the rail's 12px gutter, so it stands
              clear of the 20px icon and its stroke still ends inside the row. */}
          <ChevronRight
            aria-hidden="true"
            className="absolute top-1/2 -right-0.5 size-2.5 -translate-y-1/2 text-fg-muted"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={10}
        alignOffset={-6}
        onOpenAutoFocus={(event) => {
          if (openedByHover.current) event.preventDefault();
        }}
        onMouseEnter={cancelClose}
        onMouseLeave={closeSoon}
        className="flex max-h-[80dvh] w-56 flex-col gap-0.5 overflow-y-auto p-1.5"
      >
        <p className="flex items-center gap-2 px-3 pt-1.5 pb-1 text-caption font-semibold text-fg-muted">
          {label}
        </p>
        {items.map((item) => (
          <NavRow key={item.key} item={item} variant="flyout" activeHref={activeHref} />
        ))}
      </PopoverContent>
    </Popover>
  );
}
