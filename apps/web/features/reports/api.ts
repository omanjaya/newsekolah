"use client";

import { ApiError, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { API_URL } from "../../lib/env";
import { useActiveYear } from "../../lib/hooks/use-active-year";

export type ReportDefinition = components["schemas"]["ReportDefinition"];
export type ReportArgument = components["schemas"]["ReportArgument"];
export type ReportArgumentKind = components["schemas"]["ReportArgumentKind"];
export type Term = components["schemas"]["Term"];

export type ReportSchedule = components["schemas"]["ReportSchedule"];
export type ReportScheduleWrite = components["schemas"]["ReportScheduleWrite"];
export type ReportScheduleCadence = components["schemas"]["ReportScheduleCadence"];
export type ReportScheduleFormat = components["schemas"]["ReportScheduleFormat"];
export type ReportScheduleRun = components["schemas"]["ReportScheduleRun"];

/**
 * Query keys stay local to this feature (never `packages/api-client`'s
 * shared `queryKeys`), same convention as `features/audit/api.ts`.
 */
const REPORTS_CATALOGUE_KEY = ["reports", "catalogue"] as const;
const REPORTS_TERMS_KEY = (yearId: string) => ["reports", "terms", yearId] as const;

/** The catalogue is already filtered server-side to reports the caller may run. */
export function useReportsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: REPORTS_CATALOGUE_KEY,
    queryFn: () => client.GET("/v1/reports"),
  });
}

/** Terms of the active academic year, for report kinds that take a `term` argument. */
export function useReportTermsQuery(enabled: boolean) {
  const client = useApiClient();
  const year = useActiveYear();
  return useQuery({
    queryKey: REPORTS_TERMS_KEY(year.id),
    queryFn: () =>
      client.GET("/v1/academic/years/{yearId}/terms", {
        params: { path: { yearId: year.id } },
      }),
    enabled: enabled && year.id !== "",
  });
}

export interface ReportExportArgs {
  class_id?: string;
  grade_level_id?: string;
  subject_id?: string;
  term_id?: string;
  date?: string;
}

/** Order the file name lists its parts in; kept stable so file names are predictable. */
const FILE_NAME_ORDER: (keyof ReportExportArgs)[] = [
  "date",
  "term_id",
  "class_id",
  "grade_level_id",
  "subject_id",
];

/** Names the download after the report kind and the arguments actually supplied. */
export function buildReportFileName(reportKind: string, args: ReportExportArgs): string {
  const parts = FILE_NAME_ORDER.map((key) => args[key]).filter((value): value is string =>
    Boolean(value),
  );
  return parts.length > 0 ? `${reportKind}-${parts.join("-")}.xlsx` : `${reportKind}.xlsx`;
}

const EXPORT_ARG_KEYS: (keyof ReportExportArgs)[] = [
  "class_id",
  "grade_level_id",
  "subject_id",
  "term_id",
  "date",
];

function buildExportQuery(args: ReportExportArgs): string {
  const params = new URLSearchParams();
  for (const key of EXPORT_ARG_KEYS) {
    const value = args[key];
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

async function readErrorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "code" in body && typeof body.code === "string") {
      return body.code;
    }
  } catch {
    // Response body was not JSON (or empty); fall through to the generic code.
  }
  return "UNKNOWN";
}

/**
 * Runs a report export and saves the resulting workbook. Uses a direct
 * `fetch` rather than the shared API client: the client parses every
 * response as JSON, but this endpoint returns an XLSX binary.
 */
export async function downloadReportExport(
  reportKind: string,
  args: ReportExportArgs,
): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(
    `${API_URL}/v1/reports/${encodeURIComponent(reportKind)}/export${buildExportQuery(args)}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    },
  );
  if (!response.ok) {
    const code = await readErrorCode(response);
    throw new ApiError({ status: response.status, code, message: code });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = buildReportFileName(reportKind, args);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Scheduled exports.

const SCHEDULES_KEY = ["reports", "schedules"] as const;
const SCHEDULE_RUNS_KEY = (scheduleId: string) =>
  ["reports", "schedules", scheduleId, "runs"] as const;

function useInvalidateSchedules() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: SCHEDULES_KEY });
}

export function useReportSchedulesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: SCHEDULES_KEY,
    queryFn: () => client.GET("/v1/reports/schedules"),
  });
}

export function useCreateReportScheduleMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: (body: ReportScheduleWrite) => client.POST("/v1/reports/schedules", { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateReportScheduleMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: ({ id, ...body }: ReportScheduleWrite & { id: string }) =>
      client.PUT("/v1/reports/schedules/{scheduleId}", {
        params: { path: { scheduleId: id } },
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteReportScheduleMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/reports/schedules/{scheduleId}", {
        params: { path: { scheduleId: id } },
      }),
    onSuccess: invalidate,
  });
}

export function useSetReportScheduleEnabledMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      client.PUT("/v1/reports/schedules/{scheduleId}/enabled", {
        params: { path: { scheduleId: id } },
        body: { enabled },
      }),
    onSuccess: invalidate,
  });
}

export function useReportScheduleRunsQuery(scheduleId: string | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: SCHEDULE_RUNS_KEY(scheduleId ?? ""),
    queryFn: () =>
      client.GET("/v1/reports/schedules/{scheduleId}/runs", {
        params: { path: { scheduleId: scheduleId ?? "" } },
      }),
    enabled: scheduleId !== null,
  });
}
