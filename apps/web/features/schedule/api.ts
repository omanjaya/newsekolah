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
  /** 1 (Monday) through 7 (Sunday). Set for the whole-school day view. */
  dayOfWeek?: number;
}

export function useSchedulesQuery(filter: ScheduleFilter) {
  const client = useApiClient();
  // A day view asks for every class at once, so a day alone is enough to
  // run the query; the other two views still need their own subject.
  const enabled =
    filter.academicYearId !== "" &&
    Boolean(filter.classId ?? filter.teacherUserId ?? filter.dayOfWeek);
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
  });
}

/**
 * Teacher options for a picker: active teachers for the year, narrowed by
 * a manage_attendance/manage_schedules check on the server, so a teacher
 * without either sees only themselves.
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
  });
}

/**
 * Replaces one block. A block spans one or more periods and the server
 * keeps a row per period, so moving it means rewriting every row: the old
 * ones go, the new span is created. Doing it in that order rather than
 * the reverse avoids tripping the overlap constraint against itself.
 */
export function useReplaceScheduleBlockMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: async ({ scheduleIds, body }: { scheduleIds: string[]; body: ScheduleWrite }) => {
      for (const scheduleId of scheduleIds) {
        await client.DELETE("/v1/schedules/{scheduleId}", { params: { path: { scheduleId } } });
      }
      return client.POST("/v1/schedules", { body });
    },
    onSuccess: invalidate,
  });
}

/** Deletes every schedule row of a block (a block is one class-subject span). */
export function useDeleteScheduleBlockMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: async (scheduleIds: string[]) => {
      for (const scheduleId of scheduleIds) {
        await client.DELETE("/v1/schedules/{scheduleId}", { params: { path: { scheduleId } } });
      }
    },
    onSuccess: invalidate,
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
  });
}
