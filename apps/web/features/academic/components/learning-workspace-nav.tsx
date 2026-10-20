"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { WorkspaceNav } from "../../../components/workspace-nav";
import { canOpenPath } from "../../../lib/navigation-permissions";
import { useSession } from "../../../lib/session/session-provider";

/** Internal tab values of the two pages, grouped by the workspace tab that owns them. */
const DESTINATIONS = [
  {
    path: "/school/learning",
    tab: "subjects",
    tabs: ["subjects", "offerings"],
    label: "subjectsTab",
  },
  { path: "/school/learning", tab: "periods", tabs: ["periods"], label: "periodsTab" },
  { path: "/school/assignments", tab: "teaching", tabs: ["teaching"], label: "teachingTab" },
  { path: "/school/assignments", tab: "duties", tabs: ["duties", "types"], label: "dutiesTab" },
] as const;

/** Shared strip for the Pembelajaran workspace; existing URLs and `?tab=` values keep working. */
export function LearningWorkspaceNav(): ReactElement {
  const t = useTranslations("app.academic.workspace");
  const { me } = useSession();
  const pathname = usePathname();
  const requested = useSearchParams().get("tab");
  const items = DESTINATIONS.filter(({ path }) =>
    canOpenPath(path, (p) => me?.permissions.includes(p) ?? false, me?.profile_kind),
  ).map(({ path, tab, tabs, label }) => {
    const first = path === "/school/learning" ? "subjects" : "teaching";
    const known = DESTINATIONS.filter((d) => d.path === path).flatMap(
      (d) => d.tabs as readonly string[],
    );
    const effective = requested && known.includes(requested) ? requested : first;
    const current = (tabs as readonly string[]).includes(effective);
    return {
      href: tab === first ? path : `${path}?tab=${tab}`,
      label: t(label),
      active: pathname === path && current,
    };
  });
  return <WorkspaceNav label={t("learningNav")} items={items} />;
}
