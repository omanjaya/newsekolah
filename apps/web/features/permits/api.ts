"use client";

import { ApiError, queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type WorkflowInstance = components["schemas"]["WorkflowInstance"];
export type ExitPermitDetail = components["schemas"]["ExitPermitDetail"];
export type ExitPermitSummary = components["schemas"]["ExitPermitSummary"];
export type LateArrivalDetail = components["schemas"]["LateArrivalDetail"];
export type LateArrivalSummary = components["schemas"]["LateArrivalSummary"];
export type LeaveRequestDetail = components["schemas"]["LeaveRequestDetail"];
export type LeaveRequestSummary = components["schemas"]["LeaveRequestSummary"];
export type IssuedScanToken = components["schemas"]["IssuedScanToken"];
export type ScanPurpose = components["schemas"]["ScanPurpose"];
export type LeaveCategory = components["schemas"]["LeaveCategory"];

/**
 * QR payloads carry the instance id alongside the token so a scanner can
 * act on a permit it has never seen. Format: "sion:<kind>:<instanceId>:<token>".
 */
export function encodeScanPayload(kind: string, instanceId: string, token: string): string {
  return `sion:${kind}:${instanceId}:${token}`;
}

export function decodeScanPayload(raw: string): {
  kind?: string;
  instanceId?: string;
  token: string;
} {
  const value = raw.trim();
  if (value.startsWith("sion:")) {
    const [, kind, instanceId, token] = value.split(":");
    if (token) return { kind, instanceId, token };
  }
  return { token: value };
}

function useInvalidatePermits() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["permits"] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notificationsUnreadCount() });
  };
}

// Scan tokens (teacher side).

export function useIssueScanTokenMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (body: { purpose: ScanPurpose; context_id?: string }) =>
      client.POST("/v1/scan-tokens", { body }),
  });
}

// Classroom entry (student scans a teacher's QR to record self-attendance).

export function useScanClassroomEntryMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (body: { token: string; reason?: string }) =>
      client.POST("/v1/classroom-entry/scan", { body }),
  });
}

// Exit permits.

export function useMyExitPermitsQuery(enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.exitPermits(),
    queryFn: () => client.GET("/v1/exit-permits", { params: { query: { limit: 50 } } }),
    enabled,
  });
}

export function useExitPermitQuery(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.exitPermit(id),
    queryFn: () =>
      client.GET("/v1/exit-permits/{instanceId}", { params: { path: { instanceId: id } } }),
    enabled: id !== "",
    refetchInterval: 15_000,
    // Pause polling on a hidden tab instead of ticking forever in the
    // background.
    refetchIntervalInBackground: false,
  });
}

/** Permits waiting at whichever stage the caller's role covers: their own approval, or a security gate scan. */
export function useExitPermitReviewQueueQuery(enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.exitPermitReviewQueue(),
    queryFn: () => client.GET("/v1/exit-permits/review-queue"),
    enabled,
    refetchInterval: 30_000,
    // Pause polling on a hidden tab instead of ticking forever in the
    // background.
    refetchIntervalInBackground: false,
  });
}

export function useCreateExitPermitMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (body: { destination: string; start_period_id: string; end_period_id: string }) =>
      client.POST("/v1/exit-permits", { body }),
    onSuccess: invalidate,
  });
}

export function useScanExitPermitStageMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: ({ id, token }: { id: string; token: string }) =>
      client.POST("/v1/exit-permits/{instanceId}/scan", {
        params: { path: { instanceId: id } },
        body: { token },
      }),
    onSuccess: invalidate,
  });
}

export function useCancelExitPermitMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (id: string) =>
      client.POST("/v1/exit-permits/{instanceId}/cancel", { params: { path: { instanceId: id } } }),
    onSuccess: invalidate,
  });
}

export function useIssueGateTokenMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (id: string) =>
      client.POST("/v1/exit-permits/{instanceId}/gate-token", {
        params: { path: { instanceId: id } },
      }),
  });
}

export function useScanGateMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: ({ id, token }: { id: string; token: string }) =>
      client.POST("/v1/exit-permits/{instanceId}/gate-scan", {
        params: { path: { instanceId: id } },
        body: { token },
      }),
    onSuccess: invalidate,
  });
}

// Late arrivals.

export function useCurrentLateArrivalQuery(enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.lateArrivalCurrent(),
    // 404 is the documented "no late arrival in progress" answer, not a
    // failure; resolve it to null so the query stays in a success state.
    queryFn: async (): Promise<LateArrivalDetail | null> => {
      try {
        return await client.GET("/v1/late-arrivals/current");
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled,
    retry: false,
  });
}

export function useLateArrivalQuery(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.lateArrival(id),
    queryFn: () =>
      client.GET("/v1/late-arrivals/{instanceId}", { params: { path: { instanceId: id } } }),
    enabled: id !== "",
  });
}

export function useLateArrivalQueueQuery(enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.lateArrivalQueue(),
    queryFn: () => client.GET("/v1/late-arrivals/review-queue"),
    enabled,
    refetchInterval: 30_000,
    // Pause polling on a hidden tab instead of ticking forever in the
    // background.
    refetchIntervalInBackground: false,
  });
}

export function useOpenLateArrivalMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (body: { token: string; reason?: string }) =>
      client.POST("/v1/late-arrivals/open", { body }),
    onSuccess: invalidate,
  });
}

export function useReviewLateArrivalMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; reason?: string; homeroom_reported: boolean }) =>
      client.POST("/v1/late-arrivals/{instanceId}/review", {
        params: { path: { instanceId: id } },
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useScanLateArrivalStageMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: ({ id, token }: { id: string; token: string }) =>
      client.POST("/v1/late-arrivals/{instanceId}/scan", {
        params: { path: { instanceId: id } },
        body: { token },
      }),
    onSuccess: invalidate,
  });
}

// Leave requests.

export function useMyLeaveRequestsQuery(enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.leaveRequests(),
    queryFn: () => client.GET("/v1/leave-requests", { params: { query: { limit: 50 } } }),
    enabled,
  });
}

export function useLeaveRequestQuery(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.leaveRequest(id),
    queryFn: () =>
      client.GET("/v1/leave-requests/{instanceId}", { params: { path: { instanceId: id } } }),
    enabled: id !== "",
  });
}

export function useLeaveReviewQueueQuery(enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.leaveReviewQueue(),
    queryFn: () => client.GET("/v1/leave-requests/review-queue"),
    enabled,
    refetchInterval: 60_000,
    // Pause polling on a hidden tab instead of ticking forever in the
    // background.
    refetchIntervalInBackground: false,
  });
}

export function useSubmitLeaveRequestMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (body: {
      category: LeaveCategory;
      reason: string;
      starts_on: string;
      ends_on: string;
    }) => client.POST("/v1/leave-requests", { body }),
    onSuccess: invalidate,
  });
}

export function useGuardianLeaveQueueQuery(enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.leaveGuardianQueue(),
    queryFn: () => client.GET("/v1/leave-requests/guardian-queue"),
    enabled,
    refetchInterval: 60_000,
    // Pause polling on a hidden tab instead of ticking forever in the
    // background.
    refetchIntervalInBackground: false,
  });
}

export function useReviewLeaveRequestAsGuardianMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: ({ id, approve, note }: { id: string; approve: boolean; note?: string }) =>
      client.POST("/v1/leave-requests/{instanceId}/guardian-review", {
        params: { path: { instanceId: id } },
        body: { approve, ...(note ? { note } : {}) },
      }),
    onSuccess: invalidate,
  });
}

export function useReviewLeaveRequestMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: ({ id, approve, note }: { id: string; approve: boolean; note?: string }) =>
      client.POST("/v1/leave-requests/{instanceId}/review", {
        params: { path: { instanceId: id } },
        body: { approve, ...(note ? { note } : {}) },
      }),
    onSuccess: invalidate,
  });
}

export function useIssueLeaveLetterMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (id: string) =>
      client.POST("/v1/leave-requests/{instanceId}/issue", {
        params: { path: { instanceId: id } },
      }),
    onSuccess: invalidate,
  });
}

/** Uploads evidence straight to object storage through a presigned URL, then confirms it. */
export function useUploadEvidenceMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const grant = await client.POST("/v1/leave-requests/{instanceId}/evidence/upload-url", {
        params: { path: { instanceId: id } },
      });
      const put = await fetch(grant.upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!put.ok) throw new Error(`upload failed: ${put.status}`);
      await client.POST("/v1/leave-requests/{instanceId}/evidence/confirm", {
        params: { path: { instanceId: id } },
        body: { object_key: grant.object_key },
      });
    },
    onSuccess: invalidate,
  });
}

export function useLeaveDocumentUrlMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: "evidence" | "letter" }) =>
      client.GET("/v1/leave-requests/{instanceId}/documents/{kind}", {
        params: { path: { instanceId: id, kind } },
      }),
  });
}
