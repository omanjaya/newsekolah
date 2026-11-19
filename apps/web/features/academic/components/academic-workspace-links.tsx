"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { WorkspaceNav } from "../../../components/workspace-nav";
import { navigation } from "../../../lib/navigation";
import { navAccessFromMe } from "../../../lib/navigation-access";
import { canOpenPath } from "../../../lib/navigation-permissions";
import { useSession } from "../../../lib/session/session-provider";

/**
 * The pages of each area, as navigation registry keys: a tab's address,
 * label and access are the registry's, so the tab, the menu entry, the
 * page title and the breadcrumb share one name. `label` is the area's
 * menu entry (app.shell.nav.items), named in the strip's accessible name.
 */
const AREAS = {
  attendance: { label: "attendance", pages: ["attendance", "journal", "attendance-reports"] },
  schedule: { label: "schedule", pages: ["schedule", "school-calendar", "substitutions"] },
  years: {
    label: "years",
    pages: ["academic-years", "academic-new-year-setup", "school-promotion"],
  },
  users: { label: "users", pages: ["school-users", "settings-roles"] },
} as const;

export type AcademicArea = keyof typeof AREAS;

/**
 * The tabs between the pages of one academic or school-data area, for the
 * views that pass their own `nav` to the page template. The same pages,
 * labels and order as the template's default tabs, plus the query the
 * steps share (the year flow's source and destination years, the
 * attendance date). A strip of one page is not drawn.
 */
export function AcademicWorkspaceLinks({ area }: { area: AcademicArea }): ReactElement | null {
  const t = useTranslations();
  const { me } = useSession();
  const pathname = usePathname();
  const search = useSearchParams();
  const access = navAccessFromMe(me);
  const context = new URLSearchParams();
  for (const key of area === "years" ? ["fromYear", "toYear"] : ["date"]) {
    const value = search.get(key);
    if (value) context.set(key, value);
  }
  const suffix = context.size ? `?${context.toString()}` : "";
  const items = AREAS[area].pages.flatMap((key) => {
    const page = navigation.find((item) => item.key === key);
    if (!page || !canOpenPath(page.href, access)) return [];
    return [
      { href: `${page.href}${suffix}`, label: t(page.labelKey), active: pathname === page.href },
    ];
  });
  if (items.length < 2) return null;
  // Named as the page template names its default strip ("Bagian Jadwal dan
  // kalender"), so a screen reader hears one landmark on every sibling tab.
  const areaName = t(`app.shell.nav.items.${AREAS[area].label}`);
  return <WorkspaceNav label={t("app.page.sections", { area: areaName })} items={items} />;
}
