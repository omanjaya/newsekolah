"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type ScheduleBlock = components["schemas"]["ScheduleBlock"];
export type ScheduleWrite = components["schemas"]["ScheduleWriteRequest"];

export interface ScheduleFilter {
  academicYearId: string;
  classId?: string;
  teacherUserId?: string;
}

export function useSchedulesQuery(filter: ScheduleFilter) {
  const client = useApiClient();
  const enabled = filter.academicYearId !== "" && Boolean(filter.classId ?? filter.teacherUserId);
  return useQuery({
    queryKey: queryKeys.schedules({
      year: filter.academicYearId,
      class: filter.classId,
      teacher: filter.teacherUserId,
    }),
    queryFn: () =>
      client.GET("/v1/schedules", {
        params: {
          query: {
            academic_year_id: filter.academicYearId,
            ...(filter.classId ? { class_id: filter.classId } : {}),
            ...(filter.teacherUserId ? { teacher_user_id: filter.teacherUserId } : {}),
          },
        },
      }),
    enabled,
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
