"use client";

import { queryKeys } from "@newsekolah/api-client";
import { useMemo } from "react";

import { useLiveInvalidate } from "../../lib/realtime/use-live-invalidate";
import { useLiveTopic, useLiveTopics } from "../../lib/realtime/use-live-topic";
import { useCan, useSession } from "../../lib/session/session-provider";

/**
 * Realtime wiring for permits' queries
 * (docs/analysis/realtime-plan-2026-09-25.md chunk E, section 4.4's event
 * catalog rows 1-9). Each hook here is called from inside the matching
 * query hook in api.ts rather than from individual screens: several of
 * these queries are read from more than one screen at once (the late
 * arrival queue and the leave review queue are both also summarized on the
 * dashboard and, for leave requests, the homeroom view), so wiring at the
 * query hook covers every one of them instead of repeating the same two
 * calls at each call site.
 */

const LATE_ARRIVAL_EVENTS = ["late_arrival.opened", "late_arrival.updated"] as const;
const EXIT_PERMIT_QUEUE_EVENTS = [
  "exit_permit.stage_changed",
  "exit_permit.issued",
  "exit_permit.gate_ready",
  "exit_permit.exited",
] as const;
const EXIT_PERMIT_SELF_EVENTS = [
  "exit_permit.stage_changed",
  "exit_permit.issued",
  "exit_permit.exited",
] as const;
const LEAVE_REQUEST_QUEUE_EVENTS = ["leave_request.submitted", "leave_request.reviewed"] as const;
const LEAVE_REQUEST_SELF_EVENTS = ["leave_request.reviewed", "leave_request.issued"] as const;

/**
 * `late_arrival.opened`/`.updated` -> `duty:picket` (plan section 4.4 rows
 * 1-2, corrected from the never-seeded `duty_teacher` slug). Reviewing a
 * late arrival is offered to any teacher/staff account, not gated by a
 * specific permission (LateArrivalsView's own comment: the server scopes
 * review to whoever opened it, or `manage_attendance`) -- this mirrors
 * that same broad gate rather than a permission code the server has no
 * reason to grant everyone who can review one.
 */
export function useLateArrivalQueueLive(enabled: boolean): void {
  const { me } = useSession();
  const canHoldPicketDuty = me?.profile_kind === "teacher" || me?.profile_kind === "staff";
  useLiveTopic(enabled && canHoldPicketDuty ? "duty:picket" : undefined);
  useLiveInvalidate(LATE_ARRIVAL_EVENTS, [queryKeys.lateArrivalQueue()]);
}

/**
 * Exit permit review queue: shared by every approval stage (picket,
 * counselor, leadership) plus the security gate (plan section 4.4 rows
 * 3-6). `issue_scan_tokens` is the approver permission (ApprovePanel mints
 * approve-stage QRs, covering all three approving duties); `scan_exit_permits`
 * is the security gate's.
 */
export function useExitPermitReviewQueueLive(enabled: boolean): void {
  const canApprove = useCan("issue_scan_tokens");
  const canGate = useCan("scan_exit_permits");
  useLiveTopic(enabled && canApprove ? "duty:picket" : undefined);
  useLiveTopic(enabled && canApprove ? "duty:counselor" : undefined);
  useLiveTopic(enabled && canApprove ? "duty:leadership" : undefined);
  useLiveTopic(enabled && canGate ? "duty:security" : undefined);
  useLiveInvalidate(EXIT_PERMIT_QUEUE_EVENTS, [queryKeys.exitPermitReviewQueue()]);
}

/** The student's own exit permit list: `user:<tenant>:<student>` is auto-subscribed, no topic needed. */
export function useMyExitPermitsLive(): void {
  useLiveInvalidate(EXIT_PERMIT_SELF_EVENTS, [queryKeys.exitPermits()]);
}

/** One exit permit's detail, opened by the student (own status) or an approver acting on it. */
export function useExitPermitDetailLive(id: string): void {
  useLiveInvalidate(EXIT_PERMIT_SELF_EVENTS, [queryKeys.exitPermit(id)]);
}

/**
 * Leave request review queue: homeroom teachers subscribe one
 * `duty:homeroom:<classID>` per class they are homeroom of -- a teacher can
 * be homeroom of more than one class, per the plan's explicit instruction
 * -- and counselors subscribe `duty:counselor` (plan section 4.4 row 7).
 */
export function useLeaveReviewQueueLive(enabled: boolean): void {
  const { me } = useSession();
  const homeroomTopics = useMemo(
    () =>
      (me?.duties ?? []).flatMap((duty) =>
        duty.slug === "homeroom" && duty.scope_id ? [`duty:homeroom:${duty.scope_id}`] : [],
      ),
    [me?.duties],
  );
  const holdsCounselorDuty = (me?.duties ?? []).some((duty) => duty.slug === "counselor");
  useLiveTopics(enabled ? homeroomTopics : []);
  useLiveTopic(enabled && holdsCounselorDuty ? "duty:counselor" : undefined);
  useLiveInvalidate(LEAVE_REQUEST_QUEUE_EVENTS, [queryKeys.leaveReviewQueue()]);
}

/** The student's own leave request list: automatic user topic, same as exit permits. */
export function useMyLeaveRequestsLive(): void {
  useLiveInvalidate(LEAVE_REQUEST_SELF_EVENTS, [queryKeys.leaveRequests()]);
}

/** One leave request's detail, opened by the student (own status) or a reviewer/issuer acting on it. */
export function useLeaveRequestDetailLive(id: string): void {
  useLiveInvalidate(LEAVE_REQUEST_SELF_EVENTS, [queryKeys.leaveRequest(id)]);
}
