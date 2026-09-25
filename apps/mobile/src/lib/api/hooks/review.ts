// Duty teacher (guru piket) and homeroom teacher review queues: late
// arrivals and planned leave requests waiting for a first review before
// they move on to leadership.
import { queryKeys } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { getApiClient } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { Duty } from "@/lib/api/types";
import { useLiveInvalidate, useLiveTopic, useLiveTopics } from "@/lib/realtime";
import { t } from "@/i18n/t";

/**
 * One `duty:homeroom:<classID>` topic per class this account is homeroom
 * of (docs/analysis/realtime-plan-2026-09-25.md section 4.4 row 7) --
 * exported as a pure function so it can be unit tested directly (this repo
 * has no React render harness for mobile, see
 * __tests__/realtime-connection.test.ts's own doc comment).
 */
export function homeroomDutyTopics(duties: readonly Duty[] | undefined): string[] {
  return (duties ?? []).flatMap((duty) =>
    duty.slug === "homeroom" && duty.scope_id ? [`duty:homeroom:${duty.scope_id}`] : [],
  );
}

/**
 * `late_arrival.opened`/`.updated` -> `duty:picket`
 * (docs/analysis/realtime-plan-2026-09-25.md section 4.4 rows 1-2). This
 * screen (app/review/late-arrivals.tsx) is only reached from the teacher
 * tab group, so subscribing unconditionally on mount is the same gate the
 * web equivalent applies explicitly (any teacher/staff account can hold
 * picket duty).
 */
export function useLateArrivalReviewQueue(enabled: boolean) {
  useLiveTopic("duty:picket");
  useLiveInvalidate(
    ["late_arrival.opened", "late_arrival.updated"],
    [queryKeys.lateArrivalQueue()],
  );
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
    meta: { successMessage: t("review.reviewed") },
  });
}

/**
 * `leave_request.submitted`/`.reviewed` -> one `duty:homeroom:<classID>`
 * topic per homeroom class plus `duty:counselor` when held
 * (docs/analysis/realtime-plan-2026-09-25.md section 4.4 row 7): a teacher
 * can be homeroom of more than one class, so this subscribes one topic per
 * class rather than assuming a single homeroom (the same instruction the
 * web equivalent follows, apps/web/features/permits/realtime.ts's
 * useLeaveReviewQueueLive). `duty:counselor` is subscribed unconditionally
 * -- like `duty:picket` above, this screen is only reached by an account
 * that can hold one of these two duties, and the server rejects a
 * subscribe for a duty the caller does not actually hold.
 */
export function useLeaveReviewQueue(classId: string | undefined, enabled: boolean) {
  const { me } = useAuth();
  const homeroomTopics = useMemo(() => homeroomDutyTopics(me?.duties), [me?.duties]);
  useLiveTopics(homeroomTopics);
  useLiveTopic("duty:counselor");
  useLiveInvalidate(
    ["leave_request.submitted", "leave_request.reviewed"],
    [queryKeys.leaveReviewQueue()],
  );
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
    meta: { successMessage: t("review.reviewed") },
  });
}
