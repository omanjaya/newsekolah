"use client";

import { ApiError, queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ReportExportOptions } from "../../components/report-export-dialog";
import { getAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { reportExportExtension, withReportExportParams } from "../../lib/api/report-export-query";
import { API_URL } from "../../lib/env";

export type Employee = components["schemas"]["StaffAttendanceEmployee"];
export type ScheduleDay = components["schemas"]["StaffAttendanceScheduleDay"];
export type AttendanceRecord = components["schemas"]["StaffAttendanceRecord"];
export type ManualEntry = components["schemas"]["StaffAttendanceManualEntry"];
export type CorrectionRequest = components["schemas"]["StaffAttendanceCorrectionRequest"];
export type MonthlyRecap = components["schemas"]["StaffAttendanceMonthlyRecap"];

export function useStaffAttendanceRosterQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.staffAttendanceRoster(),
    queryFn: () => client.GET("/v1/staff-attendance/roster"),
  });
}

export function useStaffAttendanceScheduleQuery(employeeId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.staffAttendanceSchedule(employeeId),
    queryFn: () =>
      client.GET("/v1/staff-attendance/schedules/{employeeId}", {
        params: { path: { employeeId } },
      }),
    enabled: employeeId !== "",
  });
}

export function useReplaceStaffAttendanceScheduleMutation(employeeId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (days: ScheduleDay[]) =>
      client.PUT("/v1/staff-attendance/schedules/{employeeId}", {
        params: { path: { employeeId } },
        body: { days },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.staffAttendanceSchedule(employeeId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffAttendanceRoster() });
    },
  });
}

export function useStaffAttendanceTodayQuery(date: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.staffAttendanceToday(date),
    queryFn: () => client.GET("/v1/staff-attendance/today", { params: { query: { date } } }),
    enabled: date !== "",
    refetchInterval: 60_000,
    // Pause polling on a hidden tab instead of ticking forever in the
    // background.
    refetchIntervalInBackground: false,
  });
}

export function useScanStaffAttendanceMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.POST("/v1/staff-attendance/scan"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["staff-attendance", "today"] });
      void queryClient.invalidateQueries({ queryKey: ["staff-attendance", "my-history"] });
    },
  });
}

export function useRecordStaffAttendanceManualMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ManualEntry) => client.POST("/v1/staff-attendance/manual", { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["staff-attendance"] });
    },
  });
}

export function useStaffAttendanceHistoryQuery(employeeId: string, from: string, to: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.staffAttendanceHistory(employeeId, from, to),
    queryFn: () =>
      client.GET("/v1/staff-attendance/employees/{employeeId}/history", {
        params: { path: { employeeId }, query: { from, to } },
      }),
    enabled: employeeId !== "" && from !== "" && to !== "",
  });
}

/**
 * The current user's own history -- unlike {@link useStaffAttendanceHistoryQuery},
 * this needs no `view_staff_attendance` permission (see
 * `GetStaffAttendanceMyHistory` on the API side), so the self check-in
 * screen can show "this week" to a plain teacher or staff member who is
 * not a staff-attendance manager.
 */
export function useStaffAttendanceMyHistoryQuery(from: string, to: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.staffAttendanceMyHistory(from, to),
    queryFn: () =>
      client.GET("/v1/staff-attendance/me/history", { params: { query: { from, to } } }),
    enabled: from !== "" && to !== "",
  });
}

export function useStaffAttendanceRecapQuery(employeeId: string, month: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.staffAttendanceRecap(employeeId, month),
    queryFn: () =>
      client.GET("/v1/staff-attendance/employees/{employeeId}/recap", {
        params: { path: { employeeId }, query: { month } },
      }),
    enabled: employeeId !== "" && month !== "",
  });
}

export function useCorrectStaffAttendanceRecordMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recordId, body }: { recordId: string; body: CorrectionRequest }) =>
      client.PATCH("/v1/staff-attendance/records/{recordId}/correct", {
        params: { path: { recordId } },
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["staff-attendance"] });
    },
  });
}

/**
 * Downloads a blob under `filename`, then releases the object URL. Shared
 * by every direct-`fetch` export download below -- the shared API client
 * always parses the response as JSON, but these endpoints return a
 * binary workbook or PDF.
 */
function saveBlob(blob: Blob, filename: string): void {
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

async function fetchExport(path: string, query: URLSearchParams): Promise<Blob> {
  const token = getAccessToken();
  const response = await fetch(`${API_URL}${path}?${query.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new ApiError({ status: response.status, code: "UNKNOWN", message: "UNKNOWN" });
  }
  return response.blob();
}

/**
 * Runs the monthly recap export per the {@link ReportExportDialog}'s
 * chosen format/title/letterhead/columns.
 */
export async function downloadStaffAttendanceRecap(
  employeeId: string,
  month: string,
  options: ReportExportOptions,
): Promise<void> {
  const params = withReportExportParams(new URLSearchParams({ month }), options);
  const blob = await fetchExport(
    `/v1/staff-attendance/employees/${employeeId}/recap/export`,
    params,
  );
  saveBlob(blob, `staff-attendance-${employeeId}-${month}.${reportExportExtension(options)}`);
}

/**
 * Runs the whole staff's monthly recap export (one block per employee)
 * per the {@link ReportExportDialog}'s chosen options -- the
 * administrative counterpart to `downloadStaffAttendanceRecap` above.
 */
export async function downloadAllStaffAttendanceRecap(
  month: string,
  options: ReportExportOptions,
): Promise<void> {
  const params = withReportExportParams(new URLSearchParams({ month }), options);
  const blob = await fetchExport("/v1/staff-attendance/recap/export", params);
  saveBlob(blob, `staff-attendance-${month}.${reportExportExtension(options)}`);
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

export function useImportStaffAttendanceMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entries: ManualEntry[]) =>
      client.POST("/v1/staff-attendance/import", { body: { entries } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["staff-attendance"] });
    },
  });
}
