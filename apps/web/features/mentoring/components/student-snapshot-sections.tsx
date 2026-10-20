"use client";

import { Badge, Stat, StatGrid, StatusBadge } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { statusToken } from "../../../lib/attendance-status";
import { useLookup, useSubjectsQuery } from "../../reference/api";
import type { MentorStudentSnapshot } from "../api";

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

/*
 * The three sections of a student's mentoring snapshot (this month's
 * attendance, discipline, published grades), composed from other modules
 * through `GET /v1/mentoring/students/{id}/snapshot`. Shared by the
 * mentor's per-student page and the student profile.
 */

export function SnapshotAttendanceSection({
  snapshot,
}: {
  snapshot: MentorStudentSnapshot;
}): ReactElement {
  const t = useTranslations("app.mentoring.studentView");
  const tCodes = useTranslations("app.mentoring.studentView.attendance.codes");
  const entries = sortAttendanceEntries(Object.entries(snapshot.attendance_by_status));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[16px] font-medium text-fg">{t("attendance.title")}</h2>
      {entries.length === 0 ? (
        <p className="rounded-sm border border-dashed border-border p-4 text-center text-[13px] text-fg-muted">
          {t("attendance.empty")}
        </p>
      ) : (
        <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-sm border border-border bg-surface p-4">
          {entries.map(([code, count]) => {
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
  );
}

export function SnapshotDisciplineSection({
  snapshot,
}: {
  snapshot: MentorStudentSnapshot;
}): ReactElement {
  const t = useTranslations("app.mentoring.studentView");
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[16px] font-medium text-fg">{t("discipline.title")}</h2>
      <StatGrid className="max-w-sm grid-cols-2 rounded-sm border border-border bg-surface p-4">
        <Stat label={t("discipline.points")} value={snapshot.discipline_points} />
        <Stat
          label={t("discipline.active")}
          value={
            <span
              className={snapshot.discipline_active_count > 0 ? "text-status-absent" : undefined}
            >
              {snapshot.discipline_active_count}
            </span>
          }
        />
      </StatGrid>
    </section>
  );
}

export function SnapshotGradesSection({
  snapshot,
}: {
  snapshot: MentorStudentSnapshot;
}): ReactElement {
  const t = useTranslations("app.mentoring.studentView");
  const subjects = useSubjectsQuery();
  const subjectMap = useLookup(subjects.data?.data);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[16px] font-medium text-fg">{t("grades.title")}</h2>
      {snapshot.published_subjects.length === 0 ? (
        <p className="rounded-sm border border-dashed border-border p-4 text-center text-[13px] text-fg-muted">
          {t("grades.empty")}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-sm border border-border bg-surface">
          {snapshot.published_subjects.map((s) => (
            <div key={s.subject_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-[13px] text-fg">
                {subjectMap.get(s.subject_id)?.name ?? t("grades.unknownSubject")}
              </span>
              <span className="text-[14px] font-medium tabular-nums text-fg">{s.score}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
