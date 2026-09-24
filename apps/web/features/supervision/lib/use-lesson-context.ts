"use client";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useClassesQuery, useLookup, useSubjectsQuery } from "../../reference/api";
import { useSchedulesQuery } from "../../schedule/api";

/**
 * Resolves the class and subject behind one lesson block, given the
 * teacher whose weekly schedule it lives on and the `schedule_id` a
 * `ScheduledObservation` points at. Neither `ScheduledObservation` nor
 * `Observation` carries `class_id`/`subject_id` directly -- only the
 * scheduling module does -- so the same lookup this mirrors
 * `ScheduleObservationForm`'s own resolution of a teacher's lesson blocks.
 * Best-effort: an unresolved id (e.g. the lesson was later removed from the
 * timetable) reads back as `undefined` rather than throwing, since a
 * caller only ever uses this for "subject/class if available".
 */
export function useLessonContext(
  teacherUserId: string,
  scheduleId: string,
): { isLoading: boolean; className?: string; subjectName?: string } {
  const year = useActiveYear();
  const blocks = useSchedulesQuery({ academicYearId: year.id, teacherUserId });
  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);

  const block = (blocks.data?.data ?? []).find((b) => b.schedule_ids.includes(scheduleId));

  return {
    isLoading: blocks.isLoading || classes.isLoading || subjects.isLoading,
    className: block ? classMap.get(block.class_id)?.name : undefined,
    subjectName: block ? subjectMap.get(block.subject_id)?.name : undefined,
  };
}
