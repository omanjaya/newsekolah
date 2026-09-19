"use client";

import { Badge, PageHeader, Skeleton } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useLookup, useSubjectsQuery } from "../../reference/api";
import { useMentorStudentSnapshotQuery } from "../api";

import { MentorTermSummaryPanel } from "./mentor-term-summary-panel";

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
  const snapshot = useMentorStudentSnapshotQuery(studentId);
  const subjects = useSubjectsQuery();
  const subjectMap = useLookup(subjects.data?.data);

  if (snapshot.isError && !snapshot.data)
    return <QueryError retry={() => snapshot.refetch()} className="m-4" />;

  if (snapshot.isLoading || !snapshot.data) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const data = snapshot.data;
  const attendanceEntries = Object.entries(data.attendance_by_status);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={data.student_name} />
      <p className="text-[13px] text-fg-muted">{data.class_name}</p>

      <section className="flex flex-col gap-3">
        <h2 className="text-[16px] font-medium">{t("attendance.title")}</h2>
        {attendanceEntries.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("attendance.empty")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {attendanceEntries.map(([status, count]) => (
              <Badge key={status} variant="neutral">
                {status}: {count}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[16px] font-medium">{t("discipline.title")}</h2>
        <dl className="grid max-w-sm grid-cols-2 gap-2 text-[13px]">
          <dt className="text-fg-muted">{t("discipline.points")}</dt>
          <dd className="tabular-nums">{data.discipline_points}</dd>
          <dt className="text-fg-muted">{t("discipline.active")}</dt>
          <dd className="tabular-nums">{data.discipline_active_count}</dd>
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[16px] font-medium">{t("grades.title")}</h2>
        {data.published_subjects.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("grades.empty")}</p>
        ) : (
          <ul className="flex max-w-sm flex-col gap-1 text-[13px]">
            {data.published_subjects.map((s) => (
              <li key={s.subject_id} className="flex justify-between gap-2">
                <span className="text-fg-muted">
                  {subjectMap.get(s.subject_id)?.name ?? t("grades.unknownSubject")}
                </span>
                <span className="tabular-nums">{s.score}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-4">
        <h2 className="text-[16px] font-medium">{t("termSummary.title")}</h2>
        <MentorTermSummaryPanel groupId={groupId} studentId={studentId} />
      </section>
    </div>
  );
}
