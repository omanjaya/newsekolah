"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type ScheduleBlock = components["schemas"]["ScheduleBlock"];
export type ScheduleWrite = components["schemas"]["ScheduleWriteRequest"];
export type TeacherOption = components["schemas"]["UserOption"];

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
    }),
    queryFn: () =>
      client.GET("/v1/schedules", {
        params: {
          query: {
            academic_year_id: filter.academicYearId,
            ...(filter.classId ? { class_id: filter.classId } : {}),
            ...(filter.teacherUserId ? { teacher_user_id: filter.teacherUserId } : {}),
            ...(filter.dayOfWeek ? { day_of_week: filter.dayOfWeek } : {}),
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

/** Replaces every row of a merged block in one server transaction. */
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
  });
}

/** Deletes a merged block atomically; the server protects recorded history. */
export function useDeleteScheduleBlockMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: (scheduleIds: string[]) => {
      const scheduleId = scheduleIds[0];
      if (!scheduleId) throw new Error("A schedule block must contain at least one row");
      return client.DELETE("/v1/schedules/{scheduleId}", {
        params: { path: { scheduleId }, query: { schedule_ids: scheduleIds } },
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

/** Deletes every schedule of one academic year. Irreversible; the caller must confirm first. */
export function useClearSchedulesMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: (academicYearId: string) =>
      client.POST("/v1/schedules/clear", { body: { academic_year_id: academicYearId } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}
