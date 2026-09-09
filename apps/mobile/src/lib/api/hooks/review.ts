// Duty teacher (guru piket) and homeroom teacher review queues: late
// arrivals and planned leave requests waiting for a first review before
// they move on to leadership.
import { queryKeys } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api/client";

export function useLateArrivalReviewQueue(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.lateArrivalQueue(),
    queryFn: () => getApiClient().GET("/v1/late-arrivals/review-queue"),
    enabled,
  });
}

export function useReviewLateArrival() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      homeroomReported,
      reason,
    }: {
      id: string;
      homeroomReported: boolean;
      reason?: string;
    }) =>
      getApiClient().POST("/v1/late-arrivals/{instanceId}/review", {
        params: { path: { instanceId: id } },
        body: { homeroom_reported: homeroomReported, ...(reason ? { reason } : {}) },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["permits"] });
    },
  });
}

export function useLeaveReviewQueue(classId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.leaveReviewQueue(),
    queryFn: () =>
      getApiClient().GET("/v1/leave-requests/review-queue", {
        params: { query: classId ? { class_id: classId } : {} },
      }),
    enabled,
  });
}

export function useReviewLeaveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approve, note }: { id: string; approve: boolean; note?: string }) =>
      getApiClient().POST("/v1/leave-requests/{instanceId}/review", {
        params: { path: { instanceId: id } },
        body: { approve, ...(note ? { note } : {}) },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["permits"] });
    },
  });
}
