// Scan tokens and a student's own permits: exit permits, late arrivals,
// planned leave requests. Duty/homeroom review of these lives in
// ./review.ts instead, since it is a different audience and permission.
import { queryKeys } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api/client";
import type { LeaveCategory, ScanPurpose } from "./types";

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

export function useScanClassroomEntry() {
  return useMutation({
    mutationFn: (token: string) =>
      getApiClient().POST("/v1/classroom-entry/scan", { body: { token } }),
  });
}

export function useMyExitPermits(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.exitPermits(),
    queryFn: () => getApiClient().GET("/v1/exit-permits", { params: { query: { limit: 20 } } }),
    enabled,
  });
}

export function useExitPermit(id: string) {
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
  });
}

export function useCurrentLateArrival(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.lateArrivalCurrent(),
    queryFn: () => getApiClient().GET("/v1/late-arrivals/current"),
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
  });
}

export function useMyLeaveRequests(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.leaveRequests(),
    queryFn: () => getApiClient().GET("/v1/leave-requests", { params: { query: { limit: 20 } } }),
    enabled,
  });
}

export function useLeaveRequest(id: string) {
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
  });
}
