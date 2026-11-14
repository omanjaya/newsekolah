"use client";

import { cn } from "@newsekolah/ui";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { mobileNavigation } from "../lib/mobile-navigation";
import type { NavItem, NavProfileKind } from "../lib/navigation";
import { activeNavHref } from "../lib/navigation/active-href";

import { MobileMenu } from "./mobile-menu";
import { TabLink } from "./mobile-tab-slot";

/**
 * The phone's bottom tab bar (docs/superpowers/specs/2026-11-14-ui-overhaul-design.md
 * section 6, after the artboard): five slots, Beranda and three of the
 * reader's daily destinations (lib/mobile-navigation.ts), then Menu on the
 * right with everything else. Quick actions float above the bar
 * (MobileQuickActions) rather than taking a sixth slot. The bar pads
 * itself clear of the home indicator.
 */
export function MobileTabBar({
  items,
  className,
  scope,
  profile,
  duties,
}: {
  items: NavItem[];
  className?: string;
  scope?: string;
  profile?: NavProfileKind;
  duties?: readonly { slug: string }[];
}): ReactElement {
  const pathname = usePathname();
  const t = useTranslations();
  const tabItems = mobileNavigation(items, profile, duties);
  // The owner of the current route is resolved across the whole menu, then
  // matched against the tabs: otherwise a page that lives in the menu (for
  // example /library/desk) is claimed by whichever tab it merely prefixes.
  const activeHref = activeNavHref(pathname, items);
  // A page reached through Menu lights Menu up, so the bar always says where
  // the reader is, without claiming a tab the page does not belong to.
  const inMenu = activeHref !== undefined && !tabItems.some((item) => item.href === activeHref);

  return (
    <nav
      aria-label={t("app.shell.sidebar.label")}
      className={cn(
        "fixed inset-x-0 bottom-0 z-sticky h-(--shell-mobile-tab-offset) border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      <ul className="mx-auto flex h-full max-w-xl items-center px-1">
        {tabItems.map((item) => (
          <li key={item.key} className="min-w-0 flex-1">
            <TabLink
              href={item.href}
              icon={<item.icon aria-hidden="true" />}
              label={t(item.tabLabelKey ?? item.labelKey)}
              active={item.href === activeHref}
            />
          </li>
        ))}
        <li className="min-w-0 flex-1">
          <MobileMenu items={items} scope={scope} current={inMenu} />
        </li>
      </ul>
    </nav>
  );
}
