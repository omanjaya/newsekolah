"use client";

import { Button } from "@newsekolah/ui";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { WorkspaceNav } from "../../../components/workspace-nav";
import { canOpenPath } from "../../../lib/navigation-permissions";
import { useSession } from "../../../lib/session/session-provider";
import { useSubstitutionsQuery } from "../../substitutions/api";

const DESTINATIONS = {
  attendance: [
    ["/attendance", "sessions"],
    ["/journal", "journal"],
    ["/attendance/reports", "reports"],
  ],
  schedule: [
    ["/schedule", "timetable"],
    ["/school/calendar", "calendar"],
    ["/substitutions", "substitutions"],
  ],
  years: [
    ["/academic/years", "yearList"],
    ["/academic/new-year-setup", "setup"],
    ["/school/promotion", "promotion"],
  ],
  users: [
    ["/school/users", "accounts"],
    ["/settings/roles", "roles"],
  ],
} as const;

export function AcademicWorkspaceLinks({
  area,
}: {
  area: keyof typeof DESTINATIONS;
}): ReactElement {
  const t = useTranslations("app.academic.workspace");
  const { me } = useSession();
  const pathname = usePathname();
  const search = useSearchParams();
  const canOpen = (href: string) =>
    canOpenPath(href, (p) => me?.permissions.includes(p) ?? false, me?.profile_kind);
  const context = new URLSearchParams();
  for (const key of area === "years" ? ["fromYear", "toYear"] : ["date"]) {
    const value = search.get(key);
    if (value) context.set(key, value);
  }
  const suffix = context.size ? `?${context.toString()}` : "";
  const items = DESTINATIONS[area]
    .filter(([href]) => canOpen(href))
    .map(([href, key]) => ({ href: `${href}${suffix}`, label: t(key), active: pathname === href }));
  return (
    <WorkspaceNav
      label={t(area)}
      items={items}
      actions={
        area === "schedule" ? (
          <>
            {canOpen("/substitutions") && <SubstitutionInboxLink />}
            {me?.profile_kind === "student" && canOpen("/classroom-entry") && (
              <Button asChild size="sm">
                <Link href="/classroom-entry">{t("scanEntry")}</Link>
              </Button>
            )}
            {canOpen("/attendance") && (
              <Button asChild size="sm" variant="secondary">
                <Link href="/attendance">{t("openAttendance")}</Link>
              </Button>
            )}
          </>
        ) : undefined
      }
    />
  );
}

/** Fetch the inbox only for users allowed to open substitution requests. */
function SubstitutionInboxLink(): ReactElement | null {
  const t = useTranslations("app.academic.workspace");
  const requests = useSubstitutionsQuery("incoming");
  const count = requests.data?.data.filter((request) => request.status === "pending").length ?? 0;
  if (count === 0) return null;
  return (
    <Button asChild size="sm">
      <Link href="/substitutions">{t("pendingSubstitutions", { count })}</Link>
    </Button>
  );
}
