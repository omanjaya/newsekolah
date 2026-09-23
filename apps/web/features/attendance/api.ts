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
export type OwnDailyReportSession = components["schemas"]["AttendanceDailyReportSession"];

export interface TodaySessionsFilter {
  date: string;
  /** Another teacher's day instead of the caller's own. Requires manage_attendance. */
  teacherUserId?: string;
}

export function useTodaySessionsQuery(filter: TodaySessionsFilter, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.attendanceToday(filter.date, filter.teacherUserId),
    queryFn: () =>
      client.GET("/v1/attendance/me/today", {
        params: {
          query: {
            date: filter.date,
            ...(filter.teacherUserId ? { teacher_user_id: filter.teacherUserId } : {}),
          },
        },
      }),
    enabled: enabled && filter.date !== "",
    refetchInterval: 60_000,
    // Pause polling on a hidden tab instead of ticking forever in the
    // background.
    refetchIntervalInBackground: false,
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
    mutationFn: (body: { schedule_id: string; date: string; mode?: "normal" | "correction" }) =>
      client.POST("/v1/attendance/sessions", { body }),
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.attendanceSession(detail.id), detail);
      void queryClient.invalidateQueries({ queryKey: ["attendance", "today"] });
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
      void queryClient.invalidateQueries({ queryKey: ["attendance", "today"] });
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

export interface HomeroomAttendanceFilter {
  date: string;
  search?: string;
  statusCode?: string;
  limit: number;
  offset: number;
}

export function useHomeroomAttendanceQuery(filter: HomeroomAttendanceFilter, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.attendanceHomeroom(filter.date, {
      search: filter.search,
      status: filter.statusCode,
      limit: filter.limit,
      offset: filter.offset,
    }),
    queryFn: () =>
      client.GET("/v1/attendance/homeroom", {
        params: {
          query: {
            date: filter.date,
            ...(filter.search ? { search: filter.search } : {}),
            ...(filter.statusCode ? { status_code: filter.statusCode } : {}),
            limit: filter.limit,
            offset: filter.offset,
          },
        },
      }),
    enabled: enabled && filter.date !== "",
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
 * GET /v1/attendance/reports/daily/mine: every session the caller
 * submitted on `date`, as the schedule's own teacher or an accepted
 * substitute, across every class taught that day. The scope a teacher
 * without view_reports gets instead of the school-wide daily report.
 */
export function useOwnDailyAttendanceReportQuery(date: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["attendance", "reports", "daily", "mine", date] as const,
    queryFn: () => client.GET("/v1/attendance/reports/daily/mine", { params: { query: { date } } }),
    enabled: enabled && date !== "",
  });
}

/** Either a single class or a whole grade level ("angkatan"), for a report export's scope picker. */
export type ReportScope =
  { kind: "class"; classId: string } | { kind: "gradeLevel"; gradeLevelId: string };

function scopeQuery(scope: ReportScope): Record<string, string> {
  return scope.kind === "class"
    ? { class_id: scope.classId }
    : { grade_level_id: scope.gradeLevelId };
}

/**
 * Downloads a binary report export via a direct `fetch` rather than the
 * shared API client (same reasoning as `downloadReportExport` in
 * `features/reports/api.ts`: the client always parses the response as
 * JSON, but these endpoints return a binary workbook), appending
 * `scopeQuery(scope)` to `query`.
 */
async function downloadExport(
  path: string,
  query: Record<string, string>,
  filename: string,
): Promise<void> {
  const token = getAccessToken();
  const params = new URLSearchParams(query).toString();
  const response = await fetch(`${API_URL}${path}?${params}`, {
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
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Downloads the daily report as an XLSX file, for one class or a whole grade level. */
export async function downloadDailyAttendanceReport(
  date: string,
  scope: ReportScope,
): Promise<void> {
  const scopeLabel = scope.kind === "class" ? scope.classId : `grade-${scope.gradeLevelId}`;
  await downloadExport(
    "/v1/attendance/reports/daily/export",
    { date, ...scopeQuery(scope) },
    `attendance-daily-${scopeLabel}-${date}.xlsx`,
  );
}

/**
 * Downloads the monthly recap as an XLSX file, for one class or a whole
 * grade level -- one row per student (NIS, name, per-status counts,
 * total, percentage present), one sheet per class. Unlike
 * useMonthlyAttendanceSummaryQuery (one student's own calendar), this
 * scopes to a class's or grade level's whole roster at once.
 */
export async function downloadMonthlyAttendanceReport(
  month: string,
  scope: ReportScope,
): Promise<void> {
  const scopeLabel = scope.kind === "class" ? scope.classId : `grade-${scope.gradeLevelId}`;
  await downloadExport(
    "/v1/attendance/reports/monthly/export",
    { month, ...scopeQuery(scope) },
    `attendance-monthly-${scopeLabel}-${month}.xlsx`,
  );
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
