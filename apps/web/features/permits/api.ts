"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useApiClient } from "../../lib/api/client";

import {
  useExitPermitDetailLive,
  useExitPermitReviewQueueLive,
  useExitPermitsAwaitingReturnLive,
  useLateArrivalQueueLive,
  useLeaveReviewQueueLive,
  useLeaveRequestDetailLive,
  useMyExitPermitsLive,
  useMyLeaveRequestsLive,
} from "./realtime";

// apps/api's reencodeImage (leaverequest.go) only decodes JPEG/PNG, so
// the client-side compressed output must stay JPEG (compressImage's
// default) rather than WebP. Shared by the submit form and the
// attach-later flow on the detail screen.
export const LEAVE_EVIDENCE_MAX_LONG_EDGE = 1600;

export type WorkflowInstance = components["schemas"]["WorkflowInstance"];
export type ExitPermitDetail = components["schemas"]["ExitPermitDetail"];
/** A row of the student's own exit permit history: the instance, where to and when they left. */
export type MyExitPermit = components["schemas"]["MyExitPermit"];
export type ExitPermitSummary = components["schemas"]["ExitPermitSummary"];
/** A student who left on an exit permit today and is not back yet. */
export type ExitPermitAwaitingReturn = components["schemas"]["ExitPermitAwaitingReturn"];
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

/**
 * Marks every permits query stale (lists, queues, details) and the badges
 * that count them, after a change the caller made or saw happen.
 */
export function useInvalidatePermits() {
  const queryClient = useQueryClient();
  // Stable, so an effect may depend on it.
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["permits"] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.inboxCounts() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notificationsUnreadCount() });
  }, [queryClient]);
}

// Scan tokens (teacher side).

export function useIssueScanTokenMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (body: { purpose: ScanPurpose; context_id?: string }) =>
      client.POST("/v1/scan-tokens", { body }),

    meta: { errorToast: false },
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
  useMyExitPermitsLive();
  return useQuery({
    queryKey: queryKeys.exitPermits(),
    queryFn: () => client.GET("/v1/exit-permits", { params: { query: { limit: 50 } } }),
    enabled,
  });
}

/**
 * How often a detail is re-read. An approver showing a stage QR polls fast
 * (`pollMs`), since the student's scan of it sends the approver no push;
 * `false` stops polling.
 */
interface DetailPolling {
  pollMs?: number | false;
}

export function useExitPermitQuery(id: string, { pollMs = 15_000 }: DetailPolling = {}) {
  const client = useApiClient();
  useExitPermitDetailLive(id);
  return useQuery({
    queryKey: queryKeys.exitPermit(id),
    queryFn: () =>
      client.GET("/v1/exit-permits/{instanceId}", { params: { path: { instanceId: id } } }),
    enabled: id !== "",
    refetchInterval: pollMs,
    // Pause polling on a hidden tab instead of ticking forever in the
    // background.
    refetchIntervalInBackground: false,
  });
}

/** Permits waiting at whichever stage the caller's role covers: their own approval, or a security gate scan. */
export function useExitPermitReviewQueueQuery(enabled = true) {
  const client = useApiClient();
  useExitPermitReviewQueueLive(enabled);
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

/**
 * The gate's "not back yet" list (scan_exit_permits): today's students who
 * went out and are not recorded back, the earliest due first. Re-read every
 * minute as well, so a student's due time passing turns them overdue
 * without a push.
 */
export function useExitPermitsAwaitingReturnQuery(enabled = true) {
  const client = useApiClient();
  useExitPermitsAwaitingReturnLive(enabled);
  return useQuery({
    queryKey: queryKeys.exitPermitsAwaitingReturn(),
    queryFn: () => client.GET("/v1/exit-permits/awaiting-return"),
    enabled,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

/** Security records the student back through the gate. */
export function useRecordExitPermitReturnMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (id: string) =>
      client.POST("/v1/exit-permits/{instanceId}/return", {
        params: { path: { instanceId: id } },
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useCreateExitPermitMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (body: {
      destination: string;
      start_period_id: string;
      end_period_id: string;
      return_required?: boolean;
    }) => client.POST("/v1/exit-permits", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

/**
 * Duty teacher's ad-hoc desk record: for a student with no phone to run
 * the QR-relayed approval chain, this creates and completes the exit
 * permit in one call, still writing to the same workflow instance and
 * `exit_permits` row a self-service permit produces (same lists, review
 * queues and reports).
 */
export function useRecordExitPermitByStaffMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (body: {
      student_user_id: string;
      destination: string;
      start_period_id: string;
      end_period_id: string;
      return_required?: boolean;
    }) => client.POST("/v1/exit-permits/staff-record", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
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

    meta: { errorToast: false },
  });
}

export function useCancelExitPermitMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (id: string) =>
      client.POST("/v1/exit-permits/{instanceId}/cancel", { params: { path: { instanceId: id } } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useIssueGateTokenMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (id: string) =>
      client.POST("/v1/exit-permits/{instanceId}/gate-token", {
        params: { path: { instanceId: id } },
      }),

    meta: { errorToast: false },
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

    meta: { errorToast: false },
  });
}

// Late arrivals.

export function useCurrentLateArrivalQuery(enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.lateArrivalCurrent(),
    // 204 No Content is the documented "no late arrival in progress"
    // answer (no body, so the client resolves undefined despite its
    // non-null type); resolve it to null so the query holds a value.
    queryFn: async (): Promise<LateArrivalDetail | null> => {
      const current = (await client.GET("/v1/late-arrivals/current")) as
        LateArrivalDetail | undefined;
      return current ?? null;
    },
    enabled,
    retry: false,
  });
}

/** The student's own late arrivals, newest first, finished ones and hand-recorded ones included. */
export function useMyLateArrivalsQuery(enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.lateArrivalsMine(),
    queryFn: () => client.GET("/v1/late-arrivals", { params: { query: { limit: 50 } } }),
    enabled,
  });
}

export function useLateArrivalQuery(id: string, { pollMs = false }: DetailPolling = {}) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.lateArrival(id),
    queryFn: () =>
      client.GET("/v1/late-arrivals/{instanceId}", { params: { path: { instanceId: id } } }),
    enabled: id !== "",
    refetchInterval: pollMs,
    refetchIntervalInBackground: false,
  });
}

export function useLateArrivalQueueQuery(enabled = true) {
  const client = useApiClient();
  useLateArrivalQueueLive(enabled);
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

/**
 * Duty teacher records a late arrival for a student at the gate, without
 * the student's own QR scan (no phone on hand). Opens and completes the
 * same workflow a QR-driven late arrival ends up as, in one call.
 */
export function useRecordLateArrivalByStaffMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (body: {
      student_user_id: string;
      reason: string;
      homeroom_reported?: boolean;
      violation_ids?: string[];
    }) => client.POST("/v1/late-arrivals/staff-record", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useOpenLateArrivalMutation() {
  const client = useApiClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (body: { token: string; reason?: string }) =>
      client.POST("/v1/late-arrivals/open", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
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

    meta: { errorToast: false },
  });
}

export function useScanLateArrivalStageMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: ({ id, token }: { id: string; token: string }) =>
      client.POST("/v1/late-arrivals/{instanceId}/scan", {
        params: { path: { instanceId: id } },
        body: { token },
      }),
    // The last scan closes the flow, so "current" stops returning it; the
    // student's card then reads the flow by id, already answered here.
    onSuccess: (detail, { id }) => {
      queryClient.setQueryData(queryKeys.lateArrival(id), detail);
      invalidate();
    },

    meta: { errorToast: false },
  });
}

// Leave requests.

export function useMyLeaveRequestsQuery(enabled = true) {
  const client = useApiClient();
  useMyLeaveRequestsLive();
  return useQuery({
    queryKey: queryKeys.leaveRequests(),
    queryFn: () => client.GET("/v1/leave-requests", { params: { query: { limit: 50 } } }),
    enabled,
  });
}

export function useLeaveRequestQuery(id: string) {
  const client = useApiClient();
  useLeaveRequestDetailLive(id);
  return useQuery({
    queryKey: queryKeys.leaveRequest(id),
    queryFn: () =>
      client.GET("/v1/leave-requests/{instanceId}", { params: { path: { instanceId: id } } }),
    enabled: id !== "",
  });
}

export function useLeaveReviewQueueQuery(enabled = true) {
  const client = useApiClient();
  useLeaveReviewQueueLive(enabled);
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
      reason?: string;
      starts_on: string;
      ends_on: string;
    }) => client.POST("/v1/leave-requests", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
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

    meta: { errorToast: false },
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

    meta: { errorToast: false },
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

    meta: { errorToast: false },
  });
}

export function useLeaveDocumentUrlMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: "evidence" | "letter" }) =>
      client.GET("/v1/leave-requests/{instanceId}/documents/{kind}", {
        params: { path: { instanceId: id, kind } },
      }),

    meta: { errorToast: false },
  });
}
