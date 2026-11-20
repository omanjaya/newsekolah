"use client";

import { useClassesQuery, useLookup, useSubjectsQuery } from "../../reference/api";
import { useScheduleQuery } from "../../schedule/api";

/**
 * Resolves the class and subject behind the lesson a `ScheduledObservation`
 * points at (`schedule_id`). Neither `ScheduledObservation` nor
 * `Observation` carries `class_id`/`subject_id` directly -- only the
 * scheduling module does -- so the exact schedule version is read by id:
 * the timetable is effective-dated, and a visit planned for a lesson that
 * has since been changed or removed from a date on still names the lesson
 * as it was then, which a lookup in the teacher's current week would miss.
 * Best-effort: an unresolved id reads back as `undefined` rather than
 * throwing, since a caller only ever uses this for "subject/class if
 * available".
 */
export function useLessonContext(scheduleId: string): {
  isLoading: boolean;
  className?: string;
  subjectName?: string;
} {
  const lesson = useScheduleQuery(scheduleId);
  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);

  const schedule = lesson.data;

  return {
    isLoading: (scheduleId !== "" && lesson.isLoading) || classes.isLoading || subjects.isLoading,
    className: schedule ? classMap.get(schedule.class_id)?.name : undefined,
    subjectName: schedule ? subjectMap.get(schedule.subject_id)?.name : undefined,
  };
}
