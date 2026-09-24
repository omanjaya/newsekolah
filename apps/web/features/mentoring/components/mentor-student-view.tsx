"use client";

import { Badge, Button, PageHeader, Skeleton, Stat, StatGrid, StatusBadge } from "@newsekolah/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { statusToken } from "../../../lib/attendance-status";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useLookup, useSubjectsQuery } from "../../reference/api";
import { useMentorStudentSnapshotQuery } from "../api";

import { MentorTermSummaryPanel } from "./mentor-term-summary-panel";

/**
 * The order a monthly attendance recap reads best in: the tenant's default
 * five codes (docs/03-layered-architecture.md's `DefaultStatusPolicy`)
 * first, present included -- unlike `StudentYearRecap`'s exception-only
 * chips, a mentor's monthly view wants the full picture, "hadir" counted
 * alongside everything else. Any code outside this set (a reconfigured
 * tenant policy) sorts after, in whatever order the API returned it.
 */
const CODE_ORDER = ["H", "S", "I", "D", "A"];

function sortAttendanceEntries(entries: [string, number][]): [string, number][] {
  return [...entries].sort(([a], [b]) => {
    const ai = CODE_ORDER.indexOf(a);
    const bi = CODE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

/**
 * The mentor's per-student view: attendance, discipline, and published
 * grades composed from other modules (docs/03-layered-architecture.md:
 * mentoring reads these through the API, never their own tables), plus the
 * mentor's own term summary for the same student.
 */
export function MentorStudentView({
  groupId,
  studentId,
}: {
  groupId: string;
  studentId: string;
}): ReactElement {
  const t = useTranslations("app.mentoring.studentView");
  const tCodes = useTranslations("app.mentoring.studentView.attendance.codes");
  const snapshot = useMentorStudentSnapshotQuery(studentId);
  const subjects = useSubjectsQuery();
  const subjectMap = useLookup(subjects.data?.data);

  if (snapshot.isError && !snapshot.data)
    return <QueryError retry={() => snapshot.refetch()} className="m-4" />;

  if (snapshot.isLoading || !snapshot.data) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-9 w-32" />
        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-20 w-full max-w-sm" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    );
  }

  const data = snapshot.data;
  const attendanceEntries = sortAttendanceEntries(Object.entries(data.attendance_by_status));

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <Button asChild variant="secondary" size="sm" className="self-start">
        <Link href={`/mentoring/groups/${groupId}`}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("backToGroup")}
        </Link>
      </Button>

      <div className="flex flex-col gap-1">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={formatDisplayName(data.student_name)}
          className="border-b-0 pb-0"
        />
        <p className="text-[13px] text-fg-muted">{data.class_name}</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[16px] font-medium text-fg">{t("attendance.title")}</h2>
        {attendanceEntries.length === 0 ? (
          <p className="rounded-sm border border-dashed border-border p-4 text-center text-[13px] text-fg-muted">
            {t("attendance.empty")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-sm border border-border bg-surface p-4">
            {attendanceEntries.map(([code, count]) => {
              const token = statusToken(code);
              const label = tCodes.has(code) ? tCodes(code) : code;
              return (
                <div key={code} className="flex items-center gap-2">
                  {token ? (
                    <StatusBadge status={token} label={label} />
                  ) : (
                    <Badge variant="neutral">{label}</Badge>
                  )}
                  <span className="text-[16px] font-medium tabular-nums text-fg">{count}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[16px] font-medium text-fg">{t("discipline.title")}</h2>
        <StatGrid className="max-w-sm grid-cols-2 rounded-sm border border-border bg-surface p-4">
          <Stat label={t("discipline.points")} value={data.discipline_points} />
          <Stat
            label={t("discipline.active")}
            value={
              <span className={data.discipline_active_count > 0 ? "text-status-absent" : undefined}>
                {data.discipline_active_count}
              </span>
            }
          />
        </StatGrid>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[16px] font-medium text-fg">{t("grades.title")}</h2>
        {data.published_subjects.length === 0 ? (
          <p className="rounded-sm border border-dashed border-border p-4 text-center text-[13px] text-fg-muted">
            {t("grades.empty")}
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-sm border border-border bg-surface">
            {data.published_subjects.map((s) => (
              <div
                key={s.subject_id}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <span className="text-[13px] text-fg">
                  {subjectMap.get(s.subject_id)?.name ?? t("grades.unknownSubject")}
                </span>
                <span className="text-[14px] font-medium tabular-nums text-fg">{s.score}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-4">
        <h2 className="text-[16px] font-medium text-fg">{t("termSummary.title")}</h2>
        <MentorTermSummaryPanel groupId={groupId} studentId={studentId} />
      </section>
    </div>
  );
}
