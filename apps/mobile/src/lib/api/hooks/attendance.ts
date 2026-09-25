// Attendance sessions, calendar, and the homeroom (wali kelas) day view.
import { queryKeys } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api/client";
import type { SaveEntriesRequest } from "./types";

export function useTodaySessions(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.attendanceToday("today"),
    queryFn: () => getApiClient().GET("/v1/attendance/me/today"),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useOpenSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { schedule_id: string; date: string }) =>
      getApiClient().POST("/v1/attendance/sessions", { body }),
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.attendanceSession(detail.id), detail);
    },
  });
}

export function useSession(sessionId: string) {
  return useQuery({
    queryKey: queryKeys.attendanceSession(sessionId),
    queryFn: () =>
      getApiClient().GET("/v1/attendance/sessions/{sessionId}", {
        params: { path: { sessionId } },
      }),
    enabled: sessionId !== "",
  });
}

export function useSaveEntries(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveEntriesRequest) =>
      getApiClient().PUT("/v1/attendance/sessions/{sessionId}/entries", {
        params: { path: { sessionId } },
        body,
      }),
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.attendanceSession(sessionId), detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendanceToday("today") });
    },
    // app/attendance/[sessionId].tsx's submit() already handles both its
    // own success toast and a specific 409-conflict message, and treats a
    // raw network failure as a soft success (queues it offline instead of
    // an error) -- the generic default toast would be wrong there, not
    // just redundant.
    meta: { errorToast: false },
  });
}

export function useMyCalendar(month: string) {
  return useQuery({
    queryKey: queryKeys.attendanceCalendar(month),
    queryFn: () =>
      getApiClient().GET("/v1/attendance/me/calendar", { params: { query: { month } } }),
    enabled: month !== "",
  });
}

/** Homeroom teacher's (wali kelas) view: one day's daily status for every
 * student in their own homeroom class -- the class itself is resolved
 * server-side from the caller's identity. */
export function useHomeroomAttendance(date: string) {
  return useQuery({
    queryKey: queryKeys.attendanceHomeroom(date, {}),
    queryFn: () => getApiClient().GET("/v1/attendance/homeroom", { params: { query: { date } } }),
    enabled: date !== "",
  });
}
