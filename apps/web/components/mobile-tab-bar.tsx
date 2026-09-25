"use client";

import { cn } from "@newsekolah/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { mobileNavigation } from "../lib/mobile-navigation";
import type { NavItem, NavProfileKind } from "../lib/navigation";
import { activeNavHref } from "../lib/navigation/active-href";

import { MobileMenu } from "./mobile-menu";

/**
 * Frequent destinations surround a browsable menu. Global search remains
 * available from the header, while the menu exposes every permitted module.
 */
export function MobileTabBar({
  items,
  className,
  scope,
  profile,
}: {
  items: NavItem[];
  className?: string;
  scope?: string;
  profile?: NavProfileKind;
}): ReactElement {
  const pathname = usePathname();
  const t = useTranslations();
  const tabItems = mobileNavigation(items, profile);
  const activeHref = activeNavHref(pathname, tabItems);
  const [left, right] = [
    tabItems.slice(0, Math.ceil(tabItems.length / 2)),
    tabItems.slice(Math.ceil(tabItems.length / 2)),
  ];

  function renderItem(item: NavItem): ReactElement {
    const active = item.href === activeHref;
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-current={active ? "page" : undefined}
        title={t(item.tabLabelKey ?? item.labelKey)}
        className={cn(
          "flex min-w-16 flex-1 flex-col items-center gap-1 py-2 text-[12px] font-medium",
          active ? "text-accent" : "text-fg-muted",
        )}
      >
        <item.icon className="size-5 shrink-0" aria-hidden="true" />
        <span className="w-full truncate px-1 text-center">
          {t(item.tabLabelKey ?? item.labelKey)}
        </span>
      </Link>
    );
  }

  return (
    <nav
      aria-label={t("app.shell.sidebar.label")}
      className={cn(
        "fixed inset-x-0 bottom-0 z-(--z-sticky) flex min-h-[var(--shell-mobile-tab-offset)] items-center border-t border-line bg-surface",
        className,
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {left.map(renderItem)}
      <MobileMenu items={items} scope={scope} />
      {right.map(renderItem)}
    </nav>
  );
}
