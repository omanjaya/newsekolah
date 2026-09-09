"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type SessionSummary = components["schemas"]["AttendanceSessionSummary"];
export type SessionDetail = components["schemas"]["AttendanceSessionDetail"];
export type RosterItem = components["schemas"]["AttendanceRosterItem"];
export type SaveEntriesRequest = components["schemas"]["SaveAttendanceEntriesRequest"];
export type CalendarDay = components["schemas"]["AttendanceCalendarDay"];
export type RosterEntry = components["schemas"]["AttendanceRosterEntry"];

export function useTodaySessionsQuery(enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.attendanceToday(),
    queryFn: () => client.GET("/v1/attendance/me/today"),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useSessionQuery(sessionId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.attendanceSession(sessionId),
    queryFn: () =>
      client.GET("/v1/attendance/sessions/{sessionId}", { params: { path: { sessionId } } }),
    enabled: sessionId !== "",
  });
}

export function useOpenSessionMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { schedule_id: string; date: string }) =>
      client.POST("/v1/attendance/sessions", { body }),
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.attendanceSession(detail.id), detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendanceToday() });
    },
  });
}

export function useSaveEntriesMutation(sessionId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveEntriesRequest) =>
      client.PUT("/v1/attendance/sessions/{sessionId}/entries", {
        params: { path: { sessionId } },
        body,
      }),
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.attendanceSession(sessionId), detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendanceToday() });
      void queryClient.invalidateQueries({ queryKey: ["attendance", "homeroom"] });
    },
  });
}

export function useMyCalendarQuery(month: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.attendanceCalendar(month),
    queryFn: () => client.GET("/v1/attendance/me/calendar", { params: { query: { month } } }),
    enabled: month !== "",
  });
}

export function useHomeroomAttendanceQuery(date: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.attendanceHomeroom(date),
    queryFn: () => client.GET("/v1/attendance/homeroom", { params: { query: { date } } }),
    enabled: enabled && date !== "",
  });
}

/** "YYYY-MM-DD" in the tenant's timezone, for "today" queries. */
export function todayInZone(timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
