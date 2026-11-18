"use client";

import { cn, useActiveIndicator } from "@newsekolah/ui";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, type ReactElement } from "react";

import {
  menuQuickActions,
  type CentreActionId,
  type MobileTabLayout,
} from "../lib/mobile-navigation";
import type { NavItem } from "../lib/navigation";
import { activeNavHref } from "../lib/navigation/active-href";
import type { QuickAction } from "../lib/quick-actions";

import { MobileMenu } from "./mobile-menu";
import { MobileQuickActions } from "./mobile-quick-actions";
import { CentreBadge, CentreLink, TabBadge, TabLink } from "./mobile-tab-slot";

/** Each centre action's copy under `app.shell.tabBar.centre` (a short `label`, a full `name`). */
const CENTRE_MESSAGES: Record<CentreActionId, string> = {
  scan: "scan",
  "duty-qr": "dutyQr",
  attendance: "attendance",
  circulation: "circulation",
  "record-violation": "recordViolation",
  inbox: "inbox",
  "check-in": "checkIn",
  "add-visitor": "addVisitor",
  "submit-leave": "submitLeave",
  "quick-actions": "quickActions",
};

/** The slot the pill comes to rest on: the active tab (Menu included; the centre never takes it). */
const ACTIVE_TAB = '[data-tab][data-state="active"]';

/**
 * The pill's carrier: as large as the active slot (the indicator hook
 * writes its box), with the visible 56 x 28 pill at the top of it, exactly
 * over the slot's icon well (pt-2, see mobile-tab-slot.tsx). It travels
 * with `translate` only, 200ms on the standard curve (`motion-indicator`),
 * and every slot is as wide as the next, so it never needs to stretch.
 * Reduced motion strips the travel: it jumps. It sits under the slots'
 * content (`-z-1` in the track's own stacking context).
 */
const PILL_CARRIER = cn(
  "pointer-events-none absolute top-0 left-0 -z-1 flex justify-center pt-2",
  "h-(--indicator-h) w-(--indicator-w) translate-x-(--indicator-x)",
  "opacity-0 motion-indicator data-[instant]:transition-none [[data-indicator=ready]>&]:opacity-100",
);

/**
 * The phone's bottom bar (docs/superpowers/specs/2026-11-14-ui-overhaul-design.md
 * section 6, in the style the owner chose): two tabs, a raised round
 * centre action (the reader's one main act, lib/mobile-navigation.ts),
 * one tab, then Menu on the right with everything else. A soft accent
 * pill slides from the old tab to the new one behind the icon. A page
 * reached through Menu lights Menu up; the centre's own pages mark the
 * centre. The bar is the opaque surface colour, like the header, so no
 * page text ever reads through its labels, with a hairline on top, padded
 * clear of the home indicator. Its height plus the centre's overhang is
 * `--shell-mobile-tab-offset` (globals.css), which the page, sticky save
 * bars and sticky form rows keep clear of. Counts of pending items ride
 * on the tab (or the centre) they belong to, and Menu sums the rest.
 */
export function MobileTabBar({
  items,
  layout,
  quickActions = [],
  scope,
  className,
}: {
  items: NavItem[];
  /** `mobileTabLayout` for the reader (the centre's href already pointed at the right session). */
  layout: MobileTabLayout;
  /** Every quick action the reader may perform, most frequent first. */
  quickActions?: readonly QuickAction[];
  scope?: string;
  className?: string;
}): ReactElement {
  const pathname = usePathname();
  const t = useTranslations();
  const trackRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  useActiveIndicator(trackRef, pillRef, ACTIVE_TAB);

  const { tabs, centre } = layout;
  // The owner of the current route is resolved across the whole menu, then
  // matched against the tabs: otherwise a page that lives in the menu (for
  // example /library/desk) is claimed by whichever tab it merely prefixes.
  const activeHref = activeNavHref(pathname, items);
  const centreCurrent = centre?.ownerHref !== undefined && centre.ownerHref === activeHref;
  // A page reached through Menu lights Menu up, so the bar always says where
  // the reader is, without claiming a tab the page does not belong to. A page
  // the menu does not list (a hidden entry, such as /check-in reached from
  // the account menu) lights nothing: Menu would point at a list without it.
  const activeItem =
    activeHref === undefined ? undefined : items.find((item) => item.href === activeHref);
  const inMenu =
    activeItem !== undefined &&
    activeItem.sidebarPlacement !== "hidden" &&
    !centreCurrent &&
    !tabs.some((item) => item.href === activeHref);
  const centreItem = centre?.ownerHref
    ? items.find((item) => item.href === centre.ownerHref)
    : undefined;
  // What waits behind Menu: the counts of every entry with no slot of its own.
  const menuCount = items
    .filter((item) => !tabs.includes(item) && item !== centreItem)
    .reduce((sum, item) => sum + (item.badgeCount ?? 0), 0);
  const badgeLabel = (count: number) => t("app.shell.navBadge", { count });

  const tab = (item: NavItem) => {
    const active = item.href === activeHref;
    const count = item.badgeCount ?? 0;
    return (
      <li
        key={item.key}
        data-tab=""
        data-state={active ? "active" : "inactive"}
        className="flex min-w-0 flex-1"
      >
        <TabLink
          href={item.href}
          icon={<item.icon aria-hidden="true" />}
          label={t(item.tabLabelKey ?? item.labelKey)}
          active={active}
          badge={count > 0 ? <TabBadge count={count} label={badgeLabel(count)} /> : undefined}
        />
      </li>
    );
  };

  let centreSlot: ReactElement | null = null;
  if (centre) {
    const messages = `app.shell.tabBar.centre.${CENTRE_MESSAGES[centre.id]}`;
    const count = centreItem?.badgeCount ?? 0;
    const name = t(`${messages}.name`);
    centreSlot = (
      <li key="centre" className="flex min-w-0 flex-1">
        {centre.href === undefined ? (
          <MobileQuickActions />
        ) : (
          <CentreLink
            href={centre.href}
            current={centreCurrent}
            icon={<centre.icon aria-hidden="true" />}
            label={t(`${messages}.label`)}
            name={count > 0 ? t("app.shell.tabBar.withCount", { name, count }) : name}
            badge={count > 0 ? <CentreBadge count={count} /> : undefined}
          />
        )}
      </li>
    );
  }

  const [first, second, ...rest] = tabs;
  return (
    <nav
      aria-label={t("app.shell.sidebar.label")}
      data-tab-bar=""
      data-centre={centre ? "" : undefined}
      className={cn("fixed inset-x-0 bottom-0 z-sticky", className)}
    >
      <div
        className={cn(
          "border-t border-line bg-surface",
          "pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]",
        )}
      >
        <div ref={trackRef} className="relative isolate mx-auto h-16 max-w-xl px-1">
          <span ref={pillRef} aria-hidden="true" data-tab-pill="" className={PILL_CARRIER}>
            <span className="h-7 w-14 rounded-full bg-accent-soft" />
          </span>
          <ul className="flex h-full">
            {first && tab(first)}
            {second && tab(second)}
            {centreSlot}
            {rest.map(tab)}
            <li
              data-tab=""
              data-state={inMenu ? "active" : "inactive"}
              className="flex min-w-0 flex-1"
            >
              <MobileMenu
                items={items}
                scope={scope}
                current={inMenu}
                badgeCount={menuCount}
                quickActions={menuQuickActions(quickActions, centre)}
              />
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}
