// Scan tokens and a student's own permits: exit permits, late arrivals,
// planned leave requests. Duty/homeroom review of these lives in
// ./review.ts instead, since it is a different audience and permission.
import { ApiError, queryKeys } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api/client";
import { useLiveInvalidate } from "@/lib/realtime";
import { t } from "@/i18n/t";
import type { LeaveCategory, ScanPurpose } from "./types";

/**
 * The student's own exit permit / leave request status
 * (docs/analysis/realtime-plan-2026-09-25.md chunk E/F, section 4.4 rows
 * 3-9): every one of these events already lands on the automatic
 * `user:<tenant>:<user>` topic every /ws/me connection subscribes to on
 * connect, so no useLiveTopic call is needed here -- same as web's
 * equivalent (apps/web/features/permits/realtime.ts).
 */
const EXIT_PERMIT_SELF_EVENTS = [
  "exit_permit.stage_changed",
  "exit_permit.issued",
  "exit_permit.exited",
] as const;
const LEAVE_REQUEST_SELF_EVENTS = ["leave_request.reviewed", "leave_request.issued"] as const;

export function useInvalidatePermits() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["permits"] });
  };
}

export function useIssueScanToken() {
  return useMutation({
    mutationFn: (body: { purpose: ScanPurpose; context_id?: string }) =>
      getApiClient().POST("/v1/scan-tokens", { body }),
  });
}

// Every hook below through useScanGate is called from exactly one place
// (app/scan.tsx's `act()`), which already wraps all of them in one
// try/catch with its own per-action success message and a shared,
// deliberately generic failure one -- errorToast: false so the mutation
// cache's own (also generic, since a scanned QR rarely carries a specific
// ApiError code worth surfacing) default does not show a second toast on
// top of that.
export function useScanClassroomEntry() {
  return useMutation({
    mutationFn: (token: string) =>
      getApiClient().POST("/v1/classroom-entry/scan", { body: { token } }),
    meta: { errorToast: false },
  });
}

export function useMyExitPermits(enabled: boolean) {
  useLiveInvalidate(EXIT_PERMIT_SELF_EVENTS, [queryKeys.exitPermits()]);
  return useQuery({
    queryKey: queryKeys.exitPermits(),
    queryFn: () => getApiClient().GET("/v1/exit-permits", { params: { query: { limit: 20 } } }),
    enabled,
  });
}

export function useExitPermit(id: string) {
  useLiveInvalidate(EXIT_PERMIT_SELF_EVENTS, [queryKeys.exitPermit(id)]);
  return useQuery({
    queryKey: queryKeys.exitPermit(id),
    queryFn: () =>
      getApiClient().GET("/v1/exit-permits/{instanceId}", { params: { path: { instanceId: id } } }),
    enabled: id !== "",
    refetchInterval: 15_000,
  });
}

export function useCreateExitPermit() {
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (body: { destination: string; start_period_id: string; end_period_id: string }) =>
      getApiClient().POST("/v1/exit-permits", { body }),
    onSuccess: invalidate,
    meta: { successMessage: t("permits.created") },
  });
}

export function useScanExitPermitStage() {
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: ({ id, token }: { id: string; token: string }) =>
      getApiClient().POST("/v1/exit-permits/{instanceId}/scan", {
        params: { path: { instanceId: id } },
        body: { token },
      }),
    onSuccess: invalidate,
    meta: { errorToast: false }, // app/scan.tsx, see useScanClassroomEntry's comment
  });
}

export function useCancelExitPermit() {
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (id: string) =>
      getApiClient().POST("/v1/exit-permits/{instanceId}/cancel", {
        params: { path: { instanceId: id } },
      }),
    onSuccess: invalidate,
    meta: { successMessage: t("permits.cancelled") },
  });
}

export function useIssueGateToken() {
  return useMutation({
    mutationFn: (id: string) =>
      getApiClient().POST("/v1/exit-permits/{instanceId}/gate-token", {
        params: { path: { instanceId: id } },
      }),
  });
}

export function useScanGate() {
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: ({ id, token }: { id: string; token: string }) =>
      getApiClient().POST("/v1/exit-permits/{instanceId}/gate-scan", {
        params: { path: { instanceId: id } },
        body: { token },
      }),
    onSuccess: invalidate,
    meta: { errorToast: false }, // app/scan.tsx, see useScanClassroomEntry's comment
  });
}

export function useCurrentLateArrival(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.lateArrivalCurrent(),
    // 404 is the documented "no late arrival in progress" answer; resolve
    // it to null so the query does not sit in an error state.
    queryFn: async () => {
      try {
        return await getApiClient().GET("/v1/late-arrivals/current");
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled,
    retry: false,
  });
}

export function useOpenLateArrival() {
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (body: { token: string; reason?: string }) =>
      getApiClient().POST("/v1/late-arrivals/open", { body }),
    onSuccess: invalidate,
    meta: { errorToast: false }, // app/scan.tsx, see useScanClassroomEntry's comment
  });
}

export function useScanLateArrivalStage() {
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: ({ id, token }: { id: string; token: string }) =>
      getApiClient().POST("/v1/late-arrivals/{instanceId}/scan", {
        params: { path: { instanceId: id } },
        body: { token },
      }),
    onSuccess: invalidate,
    meta: { errorToast: false }, // app/scan.tsx, see useScanClassroomEntry's comment
  });
}

export function useMyLeaveRequests(enabled: boolean) {
  useLiveInvalidate(LEAVE_REQUEST_SELF_EVENTS, [queryKeys.leaveRequests()]);
  return useQuery({
    queryKey: queryKeys.leaveRequests(),
    queryFn: () => getApiClient().GET("/v1/leave-requests", { params: { query: { limit: 20 } } }),
    enabled,
  });
}

export function useLeaveRequest(id: string) {
  useLiveInvalidate(LEAVE_REQUEST_SELF_EVENTS, [queryKeys.leaveRequest(id)]);
  return useQuery({
    queryKey: queryKeys.leaveRequest(id),
    queryFn: () =>
      getApiClient().GET("/v1/leave-requests/{instanceId}", {
        params: { path: { instanceId: id } },
      }),
    enabled: id !== "",
  });
}

export function useSubmitLeaveRequest() {
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (body: {
      category: LeaveCategory;
      reason: string;
      starts_on: string;
      ends_on: string;
    }) => getApiClient().POST("/v1/leave-requests", { body }),
    onSuccess: invalidate,
    meta: { successMessage: t("leave.sent") },
  });
}
