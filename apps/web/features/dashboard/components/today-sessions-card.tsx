"use client";

import type { components } from "@newsekolah/api-client";
import { Badge, Button, Skeleton } from "@newsekolah/ui";
import { Check } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useLookup, usePeriodsQuery } from "../../reference/api";

import { SectionCard } from "./section-card";

type Session = components["schemas"]["AttendanceSessionSummary"];
interface Named {
  id: string;
  name: string;
}

/**
 * The teacher's day in clock order. Rows are a readout, not links: opening a
 * session goes through POST /v1/attendance/sessions/open first (see
 * attendance-view's openSession), so the card sends the whole visit to
 * /attendance rather than deep-linking an id that may not exist yet.
 */
export function TodaySessionsCard({
  sessions,
  isLoading,
  classMap,
  subjectMap,
  enabled,
}: {
  sessions: Session[];
  isLoading: boolean;
  classMap: Map<string, Named>;
  subjectMap: Map<string, Named>;
  enabled: boolean;
}): ReactElement {
  const t = useTranslations("app.dashboard");
  const periods = usePeriodsQuery(enabled);
  const periodMap = useLookup(periods.data?.data);

  const ordered = [...sessions].sort((a, b) =>
    (periodMap.get(a.start_period_id)?.starts_at ?? "").localeCompare(
      periodMap.get(b.start_period_id)?.starts_at ?? "",
    ),
  );
  const submitted = ordered.filter((s) => s.submitted_at).length;

  return (
    <SectionCard
      title={t("todayTitle")}
      note={
        ordered.length > 0 ? t("todayProgress", { submitted, total: ordered.length }) : undefined
      }
      action={
        <Button asChild variant="ghost" size="sm">
          <Link href="/attendance">{t("openAttendance")}</Link>
        </Button>
      }
    >
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : ordered.length === 0 ? (
        <p className="text-[13px] text-fg-muted">{t("todayEmpty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {ordered.map((session) => (
            <li
              key={session.id}
              className="grid grid-cols-[3.25rem_1fr_auto] items-center gap-3 py-2"
            >
              <span className="text-[13px] tabular-nums text-fg-muted">
                {periodMap.get(session.start_period_id)?.starts_at ?? "--:--"}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] text-fg">
                  {classMap.get(session.class_id)?.name ?? "-"}
                </span>
                <span className="block truncate text-[13px] text-fg-muted">
                  {subjectMap.get(session.subject_id)?.name ?? ""}
                </span>
              </span>
              {session.submitted_at ? (
                <span className="flex items-center gap-1.5 text-[13px] text-fg-muted">
                  <Check className="size-4" aria-hidden="true" />
                  {t("submitted")}
                </span>
              ) : (
                <Badge variant="accent">{t("pending")}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
