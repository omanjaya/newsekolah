"use client";

import { ApiError, queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { API_URL } from "../../lib/env";

export type SessionSummary = components["schemas"]["AttendanceSessionSummary"];
export type SessionDetail = components["schemas"]["AttendanceSessionDetail"];
export type RosterItem = components["schemas"]["AttendanceRosterItem"];
export type SaveEntriesRequest = components["schemas"]["SaveAttendanceEntriesRequest"];
export type CalendarDay = components["schemas"]["AttendanceCalendarDay"];
export type RosterEntry = components["schemas"]["AttendanceRosterEntry"];
export type DailyReport = components["schemas"]["AttendanceDailyReport"];

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

/** One class's expected vs. submitted sessions and per-student status for one day. */
export function useDailyAttendanceReportQuery(date: string, classId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.attendanceDailyReport(classId, date),
    queryFn: () =>
      client.GET("/v1/attendance/reports/daily", {
        params: { query: { date, class_id: classId } },
      }),
    enabled: enabled && date !== "" && classId !== "",
  });
}

/** One student's daily statuses for one month, with totals per status code. */
export function useMonthlyAttendanceSummaryQuery(studentId: string, month: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.attendanceMonthlyReport(studentId, month),
    queryFn: () =>
      client.GET("/v1/attendance/reports/monthly", {
        params: { query: { student_id: studentId, month } },
      }),
    enabled: enabled && studentId !== "" && month !== "",
  });
}

/**
 * Downloads the daily report as an XLSX file. Uses a direct `fetch` rather
 * than the shared API client, same reasoning as `downloadReportExport` in
 * `features/reports/api.ts`: the client always parses the response as
 * JSON, but this endpoint returns a binary workbook.
 */
export async function downloadDailyAttendanceReport(date: string, classId: string): Promise<void> {
  const token = getAccessToken();
  const query = new URLSearchParams({ date, class_id: classId }).toString();
  const response = await fetch(`${API_URL}/v1/attendance/reports/daily/export?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new ApiError({ status: response.status, code: "UNKNOWN", message: "UNKNOWN" });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance-daily-${classId}-${date}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
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
