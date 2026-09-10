"use client";

import { cn } from "@newsekolah/ui";
import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { NavItem } from "../lib/navigation";

import { useCommandPalette } from "./command-palette-provider";

/**
 * Mobile bottom tab bar with a raised center action slot (per the build
 * brief). The center slot opens the command palette rather than a
 * placeholder graphic: it is the one action every role already has, so it
 * is a real destination instead of dead decoration (antislop R-26).
 */
export function MobileTabBar({
  items,
  className,
}: {
  items: NavItem[];
  className?: string;
}): ReactElement {
  const pathname = usePathname();
  const t = useTranslations();
  const tPalette = useTranslations("app.shell.commandPalette");
  const commandPalette = useCommandPalette();
  const tabItems = items.filter((item) => item.showInTabBar);
  const [left, right] = [
    tabItems.slice(0, Math.ceil(tabItems.length / 2)),
    tabItems.slice(Math.ceil(tabItems.length / 2)),
  ];

  function renderItem(item: NavItem): ReactElement {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-current={active ? "page" : undefined}
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
      aria-label="Navigasi utama"
      className={cn(
        "fixed inset-x-0 bottom-0 z-(--z-sticky) flex items-center border-t border-border bg-surface",
        className,
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {left.map(renderItem)}
      <div className="flex flex-1 justify-center">
        <button
          type="button"
          onClick={commandPalette.open}
          aria-label={tPalette("trigger")}
          className={cn(
            "-mt-5 flex size-12 items-center justify-center rounded-sm bg-accent text-accent-fg",
            "shadow-(--shadow-float)",
          )}
        >
          <Search className="size-5" aria-hidden="true" />
        </button>
      </div>
      {right.map(renderItem)}
    </nav>
  );
}
