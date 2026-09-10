import { ApiError } from "@newsekolah/api-client";

interface Named {
  id: string;
  name: string;
}

interface PeriodLike {
  sequence: number;
  name: string;
}

/**
 * Turns a schedule clash into the sentence the old system used to write:
 * which class, whose lesson, and at which periods. The server sends the
 * ids of the schedule standing in the way, because every one of them is
 * already resolved here to draw the timetable.
 *
 * Returns null when the error is not a clash or carries no detail, so the
 * caller falls back to the plain message for that code.
 */
export function conflictMessage(
  error: unknown,
  lookups: {
    classMap: Map<string, Named>;
    subjectMap: Map<string, Named>;
    teacherMap: Map<string, Named>;
    periods: PeriodLike[];
  },
  t: (key: string, values?: Record<string, string>) => string,
): string | null {
  if (!(error instanceof ApiError)) return null;
  const kind =
    error.code === "SCHEDULE_CONFLICT_CLASS"
      ? "class"
      : error.code === "SCHEDULE_CONFLICT_TEACHER"
        ? "teacher"
        : null;
  if (!kind || !error.details) return null;

  const detail = (field: string) => error.details?.find((d) => d.field === field)?.code;
  const classId = detail("class_id");
  const subjectId = detail("subject_id");
  const teacherId = detail("teacher_user_id");
  const startSeq = Number(detail("start_seq"));
  const endSeq = Number(detail("end_seq"));
  if (!classId || !subjectId || !teacherId || Number.isNaN(startSeq)) return null;

  const periodName = (sequence: number) =>
    lookups.periods.find((p) => p.sequence === sequence)?.name ?? String(sequence);
  const periodLabel =
    startSeq === endSeq ? periodName(startSeq) : `${periodName(startSeq)}-${periodName(endSeq)}`;

  return t(kind === "class" ? "conflictClassDetail" : "conflictTeacherDetail", {
    period: periodLabel,
    class: lookups.classMap.get(classId)?.name ?? t("unknownClass"),
    teacher: lookups.teacherMap.get(teacherId)?.name ?? t("unknownTeacher"),
    subject: lookups.subjectMap.get(subjectId)?.name ?? t("unknownSubject"),
  });
}
