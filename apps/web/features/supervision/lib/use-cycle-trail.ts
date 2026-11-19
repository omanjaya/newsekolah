"use client";

import type { BreadcrumbItem } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

export const CYCLES_HREF = "/supervision/cycles";

export function cycleHref(cycleId: string): string {
  return `${CYCLES_HREF}/${encodeURIComponent(cycleId)}`;
}

export interface CycleTrail {
  /** The cycle list, named as its h1 and its sidebar entry ("Supervisi"). */
  root: BreadcrumbItem;
  /** The trail on a cycle's own tabs: the list, then the cycle as the current page. */
  cycle: (cycleName: string) => BreadcrumbItem[];
  /** The trail on a page below a cycle: the list, the cycle, then `rest`. */
  within: (
    cycleId: string,
    cycleName: string | undefined,
    ...rest: BreadcrumbItem[]
  ) => BreadcrumbItem[];
  /** The cycle's "Hasil" tab as a step of a trail. */
  results: (cycleId: string) => BreadcrumbItem;
}

/**
 * The one trail every supervision page below the cycle list starts from.
 * Its root reads as the list page it opens ("Supervisi", the h1 and the
 * sidebar entry), not as that page's tab, which a reader without "Supervisi
 * saya" never sees; and both of a cycle's tabs carry the same trail, so
 * switching between them moves only the underline.
 */
export function useCycleTrail(): CycleTrail {
  const t = useTranslations("app.supervision");
  return useMemo(() => {
    const root: BreadcrumbItem = { label: t("navGroupLabel"), href: CYCLES_HREF };
    return {
      root,
      cycle: (cycleName) => [root, { label: cycleName }],
      within: (cycleId, cycleName, ...rest) => [
        root,
        { label: cycleName ?? t("navLabelCycles"), href: cycleHref(cycleId) },
        ...rest,
      ],
      results: (cycleId) => ({
        label: t("cycleReport.breadcrumb"),
        href: `${cycleHref(cycleId)}/report`,
      }),
    };
  }, [t]);
}
