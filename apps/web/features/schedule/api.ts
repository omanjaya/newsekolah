"use client";

import { ApiError, queryKeys, type components } from "@newsekolah/api-client";
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
    // Timetables change a few times per semester, not per navigation: the
    // global 30s staleTime would otherwise refetch the whole grid on every
    // window focus.
    staleTime: 5 * 60_000,
  });
}

/**
 * The class whose timetable a student may read. The API lets a student
 * read only their own class's schedule but does not name that class in
 * /v1/me, so this asks for each class in turn and keeps the first one the
 * server allows. It runs once per session (the answer is cached) and only
 * for a student; a staff or teacher account never calls it.
 */
export function useStudentOwnClassQuery(
  academicYearId: string,
  classIds: string[],
  enabled: boolean,
) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["schedules", "student-own-class", academicYearId, classIds.join(",")],
    queryFn: async (): Promise<string | null> => {
      for (const classId of classIds) {
        try {
          await client.GET("/v1/schedules", {
            params: { query: { academic_year_id: academicYearId, class_id: classId } },
          });
          return classId;
        } catch (error) {
          if (error instanceof ApiError && error.status === 403) continue;
          throw error;
        }
      }
      return null;
    },
    enabled: enabled && academicYearId !== "" && classIds.length > 0,
    staleTime: Infinity,
    retry: false,
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
