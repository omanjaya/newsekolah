"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type ScheduleBlock = components["schemas"]["ScheduleBlock"];
export type ScheduleWrite = components["schemas"]["ScheduleWriteRequest"];
export type TeacherOption = components["schemas"]["UserOption"];
export type MutationPolicy = components["schemas"]["MutationPolicy"];

export interface ScheduleFilter {
  academicYearId: string;
  classId?: string;
  teacherUserId?: string;
  /** 1 (Monday) through 7 (Sunday): narrows a class or teacher view to one
   * day, or, with `allClasses`, picks the day of the whole-school view. */
  dayOfWeek?: number;
  /**
   * Set true for the whole-school day view (every class on `dayOfWeek`),
   * which needs full schedule access. Without it the query runs only for a
   * class or a teacher, so a caller whose class is missing (a student not
   * placed in a class yet) never widens into the all-classes view and its
   * 403 by accident.
   */
  allClasses?: boolean;
  /**
   * Any date ("YYYY-MM-DD") in the week to show: the timetable is
   * effective-dated, so each weekday lists the lessons in effect on its own
   * date in that Monday-Sunday week. Omitted, the server shows the school's
   * current week.
   */
  asOf?: string;
  /** Set false to skip the request, e.g. for a viewer without schedule access. */
  enabled?: boolean;
}

/**
 * A single schedule row's full detail, including `notes` and
 * `mutation_policy` -- fields the grid's merged-block list
 * (`ScheduleBlock`, from `useSchedulesQuery`) never carries. Used to
 * prefill the edit form so saving a block doesn't silently drop an
 * existing note.
 */
export function useScheduleQuery(scheduleId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["schedules", "detail", scheduleId] as const,
    queryFn: () => client.GET("/v1/schedules/{scheduleId}", { params: { path: { scheduleId } } }),
    enabled: enabled && scheduleId !== "",
  });
}

export function useSchedulesQuery(filter: ScheduleFilter) {
  const client = useApiClient();
  // A class or teacher view needs its subject; only an explicit day view
  // (allClasses) may run on a day alone.
  const enabled =
    filter.enabled !== false &&
    filter.academicYearId !== "" &&
    (Boolean(filter.classId) ||
      Boolean(filter.teacherUserId) ||
      (filter.allClasses === true && Boolean(filter.dayOfWeek)));
  return useQuery({
    queryKey: queryKeys.schedules({
      year: filter.academicYearId,
      class: filter.classId,
      teacher: filter.teacherUserId,
      day: filter.dayOfWeek,
      asOf: filter.asOf,
    }),
    queryFn: () =>
      client.GET("/v1/schedules", {
        params: {
          query: {
            academic_year_id: filter.academicYearId,
            ...(filter.classId ? { class_id: filter.classId } : {}),
            ...(filter.teacherUserId ? { teacher_user_id: filter.teacherUserId } : {}),
            ...(filter.dayOfWeek ? { day_of_week: filter.dayOfWeek } : {}),
            ...(filter.asOf ? { as_of: filter.asOf } : {}),
          },
        },
      }),
    enabled,
    // Timetables change a few times per semester, not per navigation: the
    // global 30s staleTime would otherwise refetch the whole grid on every
    // window focus.
    staleTime: 5 * 60_000,
  });
}

/**
 * The academic year's dates bound every "Berlaku mulai" picker of the
 * timetable editor. Read only for a schedule manager (the editor's only
 * user); the server validates the dates either way.
 */
export function useScheduleYearQuery(academicYearId: string, enabled: boolean) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["academic", "years", academicYearId, "span"] as const,
    queryFn: () =>
      client.GET("/v1/academic/years/{yearId}", { params: { path: { yearId: academicYearId } } }),
    enabled: enabled && academicYearId !== "",
    staleTime: 5 * 60_000,
  });
}

/**
 * Teacher options for a picker: active teachers for the year. The server
 * lists everyone only for manage_schedules or manage_master_data; a teacher
 * without either sees only themselves, and a user with no teaching load in
 * the year gets a 403, so a screen that only needs other teachers enables
 * this for those two permissions.
 */
export function useTeacherOptionsQuery(academicYearId: string, search = "", enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.teacherOptions(academicYearId, search),
    queryFn: () =>
      client.GET("/v1/schedules/teacher-options", {
        params: { query: { academic_year_id: academicYearId, ...(search ? { search } : {}) } },
      }),
    enabled: enabled && academicYearId !== "",
    staleTime: 5 * 60 * 1000,
  });
}

function useInvalidateSchedules() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["schedules"] });
  };
}

export function useCreateScheduleMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: (body: ScheduleWrite) => client.POST("/v1/schedules", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

/**
 * Replaces every row of a merged block in one server transaction. With
 * `body.effective_from` the change takes effect from that date (the old
 * version keeps every earlier date) and the response is the new version;
 * without it the block is corrected in place for the whole year.
 */
export function useReplaceScheduleBlockMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: ({ scheduleIds, body }: { scheduleIds: string[]; body: ScheduleWrite }) => {
      const scheduleId = scheduleIds[0];
      if (!scheduleId) throw new Error("A schedule block must contain at least one row");
      return client.PUT("/v1/schedules/{scheduleId}", {
        params: { path: { scheduleId }, query: { schedule_ids: scheduleIds } },
        querySerializer: { array: { style: "form", explode: false } },
        body,
      });
    },
    onSuccess: invalidate,
    // The form shows the refusal itself (a clash, or a date too early with
    // the earliest one offered), so no second message as a toast.
    meta: { errorToast: false },
  });
}

/**
 * Deletes a merged block atomically. With `effectiveFrom` the block only
 * leaves the timetable from that date on, keeping every earlier date and
 * its history; without it the block goes entirely, which the server
 * refuses once the block has history.
 */
export function useDeleteScheduleBlockMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: ({
      scheduleIds,
      effectiveFrom,
    }: {
      scheduleIds: string[];
      effectiveFrom?: string;
    }) => {
      const scheduleId = scheduleIds[0];
      if (!scheduleId) throw new Error("A schedule block must contain at least one row");
      return client.DELETE("/v1/schedules/{scheduleId}", {
        params: {
          path: { scheduleId },
          query: {
            schedule_ids: scheduleIds,
            ...(effectiveFrom ? { effective_from: effectiveFrom } : {}),
          },
        },
        querySerializer: { array: { style: "form", explode: false } },
      });
    },
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

/** Creates every row of a validated bulk-import batch in one request. */
export function useBulkImportSchedulesMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: (schedules: ScheduleWrite[]) =>
      client.POST("/v1/schedules/bulk-import", { body: { schedules } }),
    onSuccess: invalidate,
  });
}

/**
 * Clears one academic year's timetable from `effectiveFrom` on, keeping
 * every earlier week and its history (or, without a date, deletes it
 * entirely, which the server refuses once anything has history). The
 * caller must confirm first.
 */
export function useClearSchedulesMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: ({
      academicYearId,
      effectiveFrom,
    }: {
      academicYearId: string;
      effectiveFrom?: string;
    }) =>
      client.POST("/v1/schedules/clear", {
        body: {
          academic_year_id: academicYearId,
          ...(effectiveFrom ? { effective_from: effectiveFrom } : {}),
        },
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}
