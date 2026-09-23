"use client";

import { Sheet, SheetContent, SheetTrigger, cn } from "@newsekolah/ui";
import { Menu, Star } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { groupNavigation } from "../lib/group-navigation";
import type { NavItem } from "../lib/navigation";
import { activeNavHref } from "../lib/navigation/active-href";
import { useNavigationPreferences } from "../lib/navigation/use-navigation-preferences";

/** Browse every permitted destination without needing to know its search term. */
export function MobileMenu({ items, scope }: { items: NavItem[]; scope?: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations();
  const preferences = useNavigationPreferences(scope, items, pathname);
  const activeHref = activeNavHref(pathname, items);
  const groups = [
    ...(preferences.favorites.length
      ? [{ labelKey: "app.shell.mobileMenu.favorites", items: preferences.favorites }]
      : []),
    ...(preferences.recent.length
      ? [{ labelKey: "app.shell.mobileMenu.recent", items: preferences.recent }]
      : []),
    ...groupNavigation(items),
  ];
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex min-h-14 min-w-16 flex-1 flex-col items-center justify-center gap-1 py-2 text-[12px] font-medium text-fg-muted"
        >
          <Menu className="size-5" aria-hidden="true" />
          {t("app.shell.mobileMenu.title")}
        </button>
      </SheetTrigger>
      <SheetContent title={t("app.shell.mobileMenu.title")} closeLabel={t("common.actions.close")}>
        <nav
          aria-label={t("app.shell.sidebar.label")}
          className="flex flex-col gap-5 pb-[env(safe-area-inset-bottom)]"
        >
          {groups.map((group) => (
            <section key={group.labelKey} aria-label={t(group.labelKey)}>
              <h2 className="mb-1 px-3 text-[12px] font-medium text-fg-muted">
                {t(group.labelKey)}
              </h2>
              <ul className="grid gap-1 sm:grid-cols-2">
                {group.items.map((item) => {
                  const active = item.href === activeHref;
                  return (
                    <li key={item.key} className="flex min-w-0 items-center">
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        onClick={(event) => {
                          if (!event.defaultPrevented) setOpen(false);
                        }}
                        className={cn(
                          "flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-sm px-3 py-2 text-[14px]",
                          active ? "bg-accent/10 font-medium text-fg" : "text-fg hover:bg-bg",
                        )}
                      >
                        <item.icon className="size-5 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 break-words">{t(item.labelKey)}</span>
                      </Link>
                      {scope && (
                        <button
                          type="button"
                          aria-label={t("app.shell.mobileMenu.favorite", {
                            name: t(item.labelKey),
                          })}
                          aria-pressed={preferences.favorites.some(
                            (entry) => entry.key === item.key,
                          )}
                          onClick={() => {
                            preferences.toggleFavorite(item.key);
                          }}
                          className="flex size-11 shrink-0 items-center justify-center rounded-sm text-fg-muted hover:bg-bg"
                        >
                          <Star
                            aria-hidden="true"
                            className={cn(
                              "size-4",
                              preferences.favorites.some((entry) => entry.key === item.key) &&
                                "fill-current text-accent",
                            )}
                          />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
