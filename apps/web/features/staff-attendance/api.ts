"use client";

import { ApiError, queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
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
 * Downloads the monthly recap as an XLSX file. Uses a direct `fetch`
 * rather than the shared API client, same reasoning as
 * `downloadDailyAttendanceReport` in `features/attendance/api.ts`: the
 * client always parses the response as JSON, but this endpoint returns a
 * binary workbook.
 */
export async function downloadStaffAttendanceRecap(
  employeeId: string,
  month: string,
): Promise<void> {
  const token = getAccessToken();
  const query = new URLSearchParams({ month }).toString();
  const response = await fetch(
    `${API_URL}/v1/staff-attendance/employees/${employeeId}/recap/export?${query}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );
  if (!response.ok) {
    throw new ApiError({ status: response.status, code: "UNKNOWN", message: "UNKNOWN" });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `staff-attendance-${employeeId}-${month}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Downloads the whole staff's monthly recap as one XLSX workbook (one
 * block per employee), the administrative counterpart to
 * `downloadStaffAttendanceRecap` above.
 */
export async function downloadAllStaffAttendanceRecap(month: string): Promise<void> {
  const token = getAccessToken();
  const query = new URLSearchParams({ month }).toString();
  const response = await fetch(`${API_URL}/v1/staff-attendance/recap/export?${query}`, {
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
    link.download = `staff-attendance-${month}.xlsx`;
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
