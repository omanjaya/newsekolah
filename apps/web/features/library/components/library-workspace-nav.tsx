"use client";

import { NavTabs, type NavTabsLinkProps, type PageHeaderAction } from "@newsekolah/ui";
import { FileBarChart, MonitorSmartphone, QrCode, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import type { NavItem } from "../../../lib/navigation";
import { activeNavHref } from "../../../lib/navigation/active-href";
import { libraryNavItems } from "../../../lib/navigation-library";
import { useCan } from "../../../lib/session/session-provider";

/** The library areas whose pages share one tab strip. */
export type LibraryArea = "catalogue" | "circulation";

/*
 * The pages of each area, as registry keys: a tab's address, label and
 * permission are the registry's, so the tab, the menu entry and the page
 * title share one name. Catalogue settings live in the settings hub and
 * the kiosks leave the app shell, so neither is a tab.
 */
const AREA_PAGES: Record<LibraryArea, readonly string[]> = {
  catalogue: ["library-catalogue", "library-copies", "library-import", "library-stocktake"],
  circulation: ["library-desk", "library-class-loans", "library-violations", "library-visits"],
};

function renderNavLink({ href, className, children, ...rest }: NavTabsLinkProps): ReactNode {
  return (
    <Link href={href} className={className} aria-current={rest["aria-current"]}>
      {children}
    </Link>
  );
}

/** The library permissions the tabs and shortcuts check, read once each. */
function useCanAll(): (permission: string | undefined) => boolean {
  const granted: Record<string, boolean> = {
    view_library: useCan("view_library"),
    manage_library_catalog: useCan("manage_library_catalog"),
    manage_library_circulation: useCan("manage_library_circulation"),
    manage_library_members: useCan("manage_library_members"),
    manage_library_settings: useCan("manage_library_settings"),
    view_library_reports: useCan("view_library_reports"),
  };
  return (permission) => !permission || granted[permission] === true;
}

/**
 * The tabs between the pages of one library area, under the page header
 * (`AppPage`'s `nav`): the shared underline `NavTabs`, one row that
 * scrolls sideways on a phone, filtered to the pages the reader may open.
 * A strip of one page is not drawn.
 */
export function LibraryWorkspaceNav({ area }: { area: LibraryArea }): ReactElement | null {
  const t = useTranslations();
  const tArea = useTranslations("app.library.workspace");
  const pathname = usePathname();
  const can = useCanAll();
  const items = AREA_PAGES[area]
    .map((key) => libraryNavItems.find((item) => item.key === key))
    .filter((item): item is NavItem => item !== undefined && can(item.permission))
    .map((item) => ({ href: item.href, label: t(item.labelKey) }));
  if (items.length < 2) return null;
  const activeHref = activeNavHref(pathname, items);
  return (
    <NavTabs
      aria-label={tArea(area)}
      variant="underline"
      items={items.map((item) => ({ ...item, current: item.href === activeHref }))}
      renderLink={renderNavLink}
    />
  );
}

export type LibraryReportTab =
  | "loans"
  | "overdueMembers"
  | "mostBorrowed"
  | "summary"
  | "visits"
  | "members"
  | "accessionRegister";

export type LibraryShortcut =
  | "kiosk"
  | "visitKiosk"
  | "loanRules"
  | "memberTypes"
  | "catalogueSettings"
  | { report: LibraryReportTab };

function openInNewTab(href: string): void {
  window.open(href, "_blank", "noopener,noreferrer");
}

/**
 * The occasional destinations of a library page (a kiosk, a settings
 * section, the matching report) as `PageHeader` secondary actions: buttons
 * on a wide screen, one menu on a phone. Each is kept only when the reader
 * may open it; kiosks open in a new tab, since they run on a screen of
 * their own.
 */
export function useLibraryShortcuts(shortcuts: readonly LibraryShortcut[]): PageHeaderAction[] {
  const t = useTranslations("app.library.workspace");
  const can = useCanAll();
  return shortcuts.flatMap((shortcut): PageHeaderAction[] => {
    if (typeof shortcut === "object") {
      return can("view_library_reports")
        ? [
            {
              label: t("report"),
              icon: <FileBarChart />,
              href: `/library/reports?tab=${shortcut.report}`,
            },
          ]
        : [];
    }
    switch (shortcut) {
      case "kiosk":
        return can("manage_library_circulation")
          ? [
              {
                label: t("openKiosk"),
                icon: <MonitorSmartphone />,
                onSelect: () => {
                  openInNewTab("/library/kiosk");
                },
              },
            ]
          : [];
      case "visitKiosk":
        return can("manage_library_circulation")
          ? [
              {
                label: t("openVisitKiosk"),
                icon: <QrCode />,
                onSelect: () => {
                  openInNewTab("/library/visit-kiosk");
                },
              },
            ]
          : [];
      case "loanRules":
      case "memberTypes":
      case "catalogueSettings": {
        const section = shortcut === "catalogueSettings" ? "masterData" : shortcut;
        return can("manage_library_settings")
          ? [
              {
                label: t(shortcut),
                icon: <Settings2 />,
                href: `/library/settings?section=${section}`,
              },
            ]
          : [];
      }
    }
  });
}
