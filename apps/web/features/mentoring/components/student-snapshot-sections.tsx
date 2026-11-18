"use client";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  List,
  ListRow,
  Stat,
  StatGrid,
  StatusBadge,
} from "@newsekolah/ui";
import { BookOpenCheck, CalendarCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { statusToken } from "../../../lib/attendance-status";
import { useModuleEnabled } from "../../../lib/modules/use-module-enabled";
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
 * mentor's per-student page and the student profile. Each is a card.
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
    <Card padding="md">
      <CardHeader>
        <CardTitle as="h2">{t("attendance.title")}</CardTitle>
      </CardHeader>
      {entries.length === 0 ? (
        <EmptyState
          variant="compact"
          icon={<CalendarCheck aria-hidden="true" />}
          title={t("attendance.empty")}
        />
      ) : (
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {entries.map(([code, count]) => {
            const token = statusToken(code);
            const label = tCodes.has(code) ? tCodes(code) : code;
            return (
              <div key={code} className="flex items-center gap-2">
                {token ? (
                  <StatusBadge status={token} label={label} />
                ) : (
                  <Badge tone="neutral">{label}</Badge>
                )}
                {/* A count with its unit, never a bare number beside the badge. */}
                <span className="text-label tabular-nums text-fg">
                  {t("attendance.days", { count })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/**
 * Left out while the school has discipline off: the API then reports no
 * points for anyone, and the section must not read as a clean record.
 */
export function SnapshotDisciplineSection({
  snapshot,
}: {
  snapshot: MentorStudentSnapshot;
}): ReactElement | null {
  const t = useTranslations("app.mentoring.studentView");
  const disciplineOn = useModuleEnabled("discipline");
  if (!disciplineOn) return null;
  return (
    <Card padding="md">
      <CardHeader>
        <CardTitle as="h2">{t("discipline.title")}</CardTitle>
      </CardHeader>
      {/* Two figures: two columns at every width, not StatGrid's four from sm. */}
      <StatGrid className="grid-cols-2 sm:max-w-md sm:grid-cols-2">
        <Stat label={t("discipline.points")} value={snapshot.discipline_points} />
        <Stat
          label={t("discipline.active")}
          value={
            <span className={snapshot.discipline_active_count > 0 ? "text-danger" : undefined}>
              {snapshot.discipline_active_count}
            </span>
          }
        />
      </StatGrid>
    </Card>
  );
}

/** Left out while the school has grading off (the API then has no grades to report). */
export function SnapshotGradesSection({
  snapshot,
}: {
  snapshot: MentorStudentSnapshot;
}): ReactElement | null {
  const t = useTranslations("app.mentoring.studentView");
  const subjects = useSubjectsQuery();
  const subjectMap = useLookup(subjects.data?.data);
  const gradingOn = useModuleEnabled("grading");

  if (!gradingOn) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("grades.title")}</CardTitle>
      </CardHeader>
      {snapshot.published_subjects.length === 0 ? (
        <CardContent>
          <EmptyState
            variant="compact"
            icon={<BookOpenCheck aria-hidden="true" />}
            title={t("grades.empty")}
          />
        </CardContent>
      ) : (
        <List>
          {snapshot.published_subjects.map((s) => (
            <ListRow
              key={s.subject_id}
              title={subjectMap.get(s.subject_id)?.name ?? t("grades.unknownSubject")}
              trailing={<span className="text-label text-fg tabular-nums">{s.score}</span>}
            />
          ))}
        </List>
      )}
    </Card>
  );
}
