"use client";

import { ApiError, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ReportExportOptions } from "../../components/report-export-dialog";
import { getAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { reportExportExtension, withReportExportParams } from "../../lib/api/report-export-query";
import { API_URL } from "../../lib/env";

export type SupervisionCriterion = components["schemas"]["SupervisionCriterion"];
export type SupervisionInstrument = components["schemas"]["SupervisionInstrument"];
export type SupervisionCycle = components["schemas"]["SupervisionCycle"];
export type SupervisionCycleWrite = components["schemas"]["SupervisionCycleWrite"];
export type ScheduledObservation = components["schemas"]["ScheduledObservation"];
export type CriterionScore = components["schemas"]["CriterionScore"];
export type Observation = components["schemas"]["Observation"];
export type TeacherSupervisionReport = components["schemas"]["TeacherSupervisionReport"];

/**
 * Query keys local to this feature (not added to the shared
 * `packages/api-client` registry per the task's scope) all under
 * `["supervision", ...]` so a single prefix invalidates everything below.
 */
const keys = {
  cycles: () => ["supervision", "cycles"] as const,
  cycle: (cycleId: string) => ["supervision", "cycle", cycleId] as const,
  scheduled: (cycleId: string) => ["supervision", "scheduled", cycleId] as const,
  scheduledForTeacher: (cycleId: string, teacherId: string) =>
    ["supervision", "scheduled", cycleId, "teacher", teacherId] as const,
  observation: (observationId: string) => ["supervision", "observation", observationId] as const,
  report: (cycleId: string, teacherId: string) =>
    ["supervision", "report", cycleId, teacherId] as const,
};

function useInvalidateSupervision() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["supervision"] });
}

// Cycles.

export function useSupervisionCyclesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.cycles(),
    queryFn: () => client.GET("/v1/supervision/cycles"),
  });
}

export function useSupervisionCycleQuery(cycleId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.cycle(cycleId),
    queryFn: () =>
      client.GET("/v1/supervision/cycles/{cycleId}", { params: { path: { cycleId } } }),
    enabled: enabled && cycleId !== "",
  });
}

export function useCreateSupervisionCycleMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSupervision();
  return useMutation({
    mutationFn: (body: SupervisionCycleWrite) => client.POST("/v1/supervision/cycles", { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateSupervisionCycleMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSupervision();
  return useMutation({
    mutationFn: ({ cycleId, ...body }: SupervisionCycleWrite & { cycleId: string }) =>
      client.PUT("/v1/supervision/cycles/{cycleId}", { params: { path: { cycleId } }, body }),
    onSuccess: invalidate,
  });
}

// Scheduled observations.

export function useScheduledObservationsQuery(cycleId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.scheduled(cycleId),
    queryFn: () =>
      client.GET("/v1/supervision/cycles/{cycleId}/scheduled", { params: { path: { cycleId } } }),
    enabled: enabled && cycleId !== "",
  });
}

export function useScheduledObservationsForTeacherQuery(
  cycleId: string,
  teacherId: string,
  enabled = true,
) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.scheduledForTeacher(cycleId, teacherId),
    queryFn: () =>
      client.GET("/v1/supervision/cycles/{cycleId}/teachers/{teacherId}/scheduled", {
        params: { path: { cycleId, teacherId } },
      }),
    enabled: enabled && cycleId !== "" && teacherId !== "",
  });
}

export function useScheduleObservationMutation(cycleId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateSupervision();
  return useMutation({
    mutationFn: (body: { schedule_id: string; lesson_date: string }) =>
      client.POST("/v1/supervision/cycles/{cycleId}/scheduled", {
        params: { path: { cycleId } },
        body,
      }),
    onSuccess: invalidate,
  });
}

// Observations.

export function useCompleteObservationMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSupervision();
  return useMutation({
    mutationFn: (body: {
      scheduled_id: string;
      scores: CriterionScore[];
      observer_notes: string;
      teacher_response?: string;
      agreed_follow_up?: string;
      observed_at: string;
    }) => client.POST("/v1/supervision/observations", { body }),
    onSuccess: invalidate,
  });
}

export function useObservationQuery(observationId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.observation(observationId),
    queryFn: () =>
      client.GET("/v1/supervision/observations/{observationId}", {
        params: { path: { observationId } },
      }),
    enabled: enabled && observationId !== "",
  });
}

export function useRespondToObservationMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateSupervision();
  return useMutation({
    mutationFn: ({
      observationId,
      ...body
    }: {
      observationId: string;
      teacher_response?: string;
      agreed_follow_up?: string;
    }) =>
      client.PUT("/v1/supervision/observations/{observationId}/response", {
        params: { path: { observationId } },
        body,
      }),
    onSuccess: invalidate,
  });
}

// Reports.

export function useTeacherSupervisionReportQuery(
  cycleId: string,
  teacherId: string,
  enabled = true,
) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.report(cycleId, teacherId),
    queryFn: () =>
      client.GET("/v1/supervision/cycles/{cycleId}/teachers/{teacherId}/report", {
        params: { path: { cycleId, teacherId } },
      }),
    enabled: enabled && cycleId !== "" && teacherId !== "",
  });
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
 * Runs the per-teacher report export per the {@link ReportExportDialog}'s
 * chosen format/title/letterhead/columns. Uses a direct `fetch` rather
 * than the shared API client, same as `features/reports/api.ts`: the
 * client parses every response as JSON, but this endpoint returns an
 * XLSX or PDF binary.
 */
export async function downloadTeacherSupervisionReport(
  cycleId: string,
  teacherId: string,
  fileNameBase: string,
  options: ReportExportOptions,
): Promise<void> {
  const token = getAccessToken();
  const params = withReportExportParams(new URLSearchParams(), options);
  const response = await fetch(
    `${API_URL}/v1/supervision/cycles/${encodeURIComponent(cycleId)}/teachers/${encodeURIComponent(teacherId)}/report/export?${params.toString()}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
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
    link.download = `${fileNameBase}.${reportExportExtension(options)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
