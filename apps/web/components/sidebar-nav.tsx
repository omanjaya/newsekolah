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
import type {
  Dispatch,
  PointerEvent,
  ReactElement,
  ReactNode,
  SetStateAction,
  SyntheticEvent,
} from "react";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";

import { navGroupIcons, navGroupLabelKey, type NavItem } from "../lib/navigation";

import { NAV_MARKER_ATTR } from "./use-nav-marker";

/**
 * Where the active marker sits, relative to the list's padding box: in the
 * 12px gutter left of a top-level row, or centred on a group's guide rule
 * (12px list padding plus the 20px indent, minus half the 3px marker).
 */
export const NAV_MARKER_OFFSETS = { top: 4, nested: 31 } as const;

/**
 * One row's frame: 36px, the pill radius, colour changes at the 120ms state pace.
 * Exported with ROW_ACTIVE and ROW_IDLE_TOP for the branding preview, which
 * draws the menu as the app does.
 */
export const ROW =
  "relative flex h-9 shrink-0 items-center rounded-md text-body-sm font-medium transition-colors focus-visible:-outline-offset-2";
export const ROW_IDLE_TOP = "text-fg hover:bg-state-hover active:bg-state-pressed";
const ROW_IDLE_NESTED = "text-fg-muted hover:bg-state-hover hover:text-fg active:bg-state-pressed";
export const ROW_ACTIVE = "bg-accent-soft font-semibold text-accent-soft-fg";

/**
 * Stops a hidden label's trigger from asking to open. Radix still reports
 * an open request while the controlled prop says closed, and that report
 * closes every other tooltip and skips the provider's delay for the next.
 * Its handlers skip their own work for an event already prevented.
 */
function keepLabelClosed(event: SyntheticEvent) {
  event.preventDefault();
}

/**
 * Shows the label as a tooltip only while the sidebar is a rail and the text
 * is hidden. The tooltip wraps the row at either width, so switching width
 * keeps the same element: wrapping it only on the rail remounted it, and
 * the collapse toggle a reader had just pressed lost focus to the page.
 */
export function RailLabel({
  label,
  enabled,
  children,
}: {
  label: string;
  enabled: boolean;
  children: ReactNode;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const quiet = enabled ? undefined : keepLabelClosed;
  return (
    <Tooltip open={enabled && open} onOpenChange={setOpen}>
      <TooltipTrigger asChild onPointerMove={quiet} onFocus={quiet}>
        {children}
      </TooltipTrigger>
      {enabled && (
        <TooltipContent side="right" sideOffset={10}>
          {label}
        </TooltipContent>
      )}
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
 * How the open panel came to be open. A `peek` follows a mouse hovering
 * the icon: it leaves focus where the reader had it and closes when the
 * mouse moves away. A `pinned` panel was asked for (a click, a tap, a key,
 * or focus moving into it): it takes focus in and stays until dismissed.
 */
type FlyoutMode = "peek" | "pinned";

/** The rail's one open flyout: its group, the route it opened on, and how. */
interface OpenFlyout {
  group: string;
  at: string;
  mode: FlyoutMode;
}

type RailFlyoutState = [OpenFlyout | null, Dispatch<SetStateAction<OpenFlyout | null>>];

const RailFlyoutContext = createContext<RailFlyoutState | null>(null);

/**
 * Holds the rail's open flyout, so only one panel is open at a time.
 * Opening a group closes the one before it; while a panel is pinned,
 * hovering another group's icon moves the pinned panel there, as a
 * menubar does.
 */
export function RailFlyouts({ children }: { children: ReactNode }): ReactElement {
  const state = useState<OpenFlyout | null>(null);
  return <RailFlyoutContext.Provider value={state}>{children}</RailFlyoutContext.Provider>;
}

function useRailFlyout(): RailFlyoutState {
  const state = useContext(RailFlyoutContext);
  if (!state) throw new Error("GroupFlyout must be used within RailFlyouts");
  return state;
}

function focusFirstLink(container: HTMLElement | null) {
  container?.querySelector<HTMLElement>("a[href]")?.focus({ preventScroll: true });
}

/**
 * One group as a single rail icon that opens its pages in a flyout panel.
 * A mouse hovering it peeks; a click, a tap or a key pins it open and moves
 * focus to its first page, also when the peek is already showing. A small
 * chevron tells it apart from the rail's plain links, which navigate at once.
 * Render it inside `RailFlyouts`.
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
  const [current, setCurrent] = useRailFlyout();

  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  // A mouse always hovers before it presses, so the click that follows a
  // hover must pin the panel instead of toggling it shut. The hover
  // records that it opened the panel, pointerdown carries it to the
  // click, and the click reads it.
  const hoverOpened = useRef(false);
  const clickPins = useRef(false);
  // Whether focus sat inside the panel when it was asked to close, so it
  // can go back to the trigger instead of dropping to the page.
  const focusWasInside = useRef(false);
  // A press outside the panel (not on its trigger) closed it: the reader
  // chose where to be, and Radix leaves focus alone after that.
  const pressedOutside = useRef(false);

  // Open is derived, not stored here: the panel belongs to the route it was
  // opened on, so following a link inside it closes it with no effect and no
  // setState during the click. Closing from the click itself aborts the
  // navigation -- Radix unmounts the portal before Next commits the route.
  const open = current?.group === group && current.at === pathname;
  const mode = open ? current.mode : undefined;

  function openAs(next: FlyoutMode) {
    pressedOutside.current = false;
    setCurrent({ group, at: pathname, mode: next });
  }

  function close() {
    focusWasInside.current = contentRef.current?.contains(document.activeElement) ?? false;
    // Another group may have opened since this close was scheduled.
    setCurrent((prev) => (prev?.group === group ? null : prev));
  }

  const label = t(navGroupLabelKey(group));
  const Icon = navGroupIcons[group];
  const holdsActive = items.some((item) => item.href === activeHref);

  function cancelClose() {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  /** Closes a peek once the mouse has been gone a moment; a pinned panel stays. */
  function closeSoon(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse" || mode !== "peek") return;
    cancelClose();
    closeTimer.current = window.setTimeout(close, FLYOUT_CLOSE_DELAY_MS);
  }

  function pin() {
    cancelClose();
    setCurrent((prev) =>
      prev?.group === group && prev.mode !== "pinned" ? { ...prev, mode: "pinned" } : prev,
    );
  }

  useEffect(() => cancelClose, []);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Radix opens only from the trigger's own click (or key), which
        // asks for the panel: it is pinned.
        if (next) {
          hoverOpened.current = false;
          openAs("pinned");
        } else {
          close();
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={t("app.shell.nav.groupMenu", { group: label })}
          // Pointer events, not mouse events: a tap fires compatibility
          // mouseenter and mouseleave around its click, which would open a
          // peek and close it again a moment later. Only a real mouse hovers.
          onPointerEnter={(event) => {
            if (event.pointerType !== "mouse") return;
            cancelClose();
            if (open) return;
            hoverOpened.current = true;
            // While another group's panel is pinned, the pinned panel
            // moves here; otherwise this is a peek.
            openAs(current?.at === pathname && current.mode === "pinned" ? "pinned" : "peek");
          }}
          onPointerLeave={(event) => {
            // A press released off the trigger never clicks it, so the
            // flag must not wait for a click to clear: it would swallow the
            // next keyboard toggle.
            clickPins.current = false;
            closeSoon(event);
          }}
          onPointerCancel={() => {
            clickPins.current = false;
          }}
          onPointerDown={() => {
            clickPins.current = open && hoverOpened.current;
          }}
          onClick={(event) => {
            if (!clickPins.current) return;
            clickPins.current = false;
            hoverOpened.current = false;
            // Skips Radix's toggle (composeEventHandlers checks it).
            event.preventDefault();
            pin();
            focusFirstLink(contentRef.current);
          }}
          // A key activates the trigger as a click does: on a peek it pins
          // the panel and moves focus in, rather than toggling it shut. Read
          // from the panel's state, not from a pointer press that may never
          // have become a click.
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              clickPins.current = open && mode === "peek";
            }
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
        ref={contentRef}
        side="right"
        align="start"
        sideOffset={10}
        alignOffset={-6}
        // Radix would focus the panel itself (it skips links when it looks
        // for something to focus), which shows no ring. A pinned panel
        // focuses its first page instead; a peek leaves focus alone.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (mode === "pinned") focusFirstLink(contentRef.current);
        }}
        onPointerDownOutside={(event) => {
          const target = event.detail.originalEvent.target;
          if (!(target instanceof Node && triggerRef.current?.contains(target))) {
            pressedOutside.current = true;
          }
        }}
        // Radix would send focus to the trigger after any close no outside
        // press caused, even a peek's while the reader typed elsewhere.
        // Focus goes back to the trigger only when it was in the panel and
        // now has nowhere to be (Escape, or the trigger pressed in Safari,
        // which does not focus a clicked button). Focus the reader or
        // another flyout moved stays, and so does the page after a press
        // outside.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const active = document.activeElement;
          const lost = active === null || active === document.body || !active.isConnected;
          if (focusWasInside.current && lost && !pressedOutside.current) {
            triggerRef.current?.focus();
          }
          focusWasInside.current = false;
          pressedOutside.current = false;
        }}
        onFocus={pin}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") cancelClose();
        }}
        onPointerLeave={closeSoon}
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
