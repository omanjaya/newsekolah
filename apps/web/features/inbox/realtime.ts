"use client";

import { queryKeys } from "@newsekolah/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useLiveSocketContext } from "../../lib/realtime/live-socket-provider";
import { useLiveInvalidate } from "../../lib/realtime/use-live-invalidate";
import {
  EXIT_PERMIT_QUEUE_EVENTS,
  LATE_ARRIVAL_EVENTS,
  LEAVE_REQUEST_QUEUE_EVENTS,
  useExitPermitReviewQueueLive,
  useLateArrivalQueueLive,
  useLeaveReviewQueueLive,
} from "../permits/realtime";

import type { InboxAccess } from "./lib/access";

/**
 * Discipline pushes nothing of its own over /ws/me. Crossing an SP
 * threshold does notify the counselors, though, and that notification is
 * the only live signal that the warning-letter count changed.
 */
const DISCIPLINE_NOTIFICATION_KINDS: readonly string[] = [
  "discipline_threshold_reached",
  "warning_letter_issued",
];

interface NotificationCreatedPayload {
  kind?: string;
}

/**
 * Keeps the inbox counts fresh from the same realtime layer the queues use.
 * The queue hooks supply the duty/homeroom topic subscriptions the badge
 * needs (the counts query has no queue mounted behind it); the permit
 * events invalidate the counts, and so does a reconnect resync. `enabled`
 * is false for display-only readers, so the listeners register once (from
 * the app shell) rather than once per reader.
 */
export function useInboxCountsLive(access: InboxAccess, enabled: boolean): void {
  const queryClient = useQueryClient();
  const { registerListener } = useLiveSocketContext();

  useLeaveReviewQueueLive(enabled && access.leave);
  useExitPermitReviewQueueLive(enabled && access.exit);
  useLateArrivalQueueLive(enabled && access.late);

  const counts = [queryKeys.inboxCounts()];
  useLiveInvalidate(LEAVE_REQUEST_QUEUE_EVENTS, enabled && access.leave ? counts : []);
  useLiveInvalidate(EXIT_PERMIT_QUEUE_EVENTS, enabled && access.exit ? counts : []);
  useLiveInvalidate(LATE_ARRIVAL_EVENTS, enabled && access.late ? counts : []);

  const warningLetters = enabled && access.warningLetters;
  useEffect(() => {
    if (!warningLetters) return undefined;
    return registerListener({
      matches: (type) => type === "notification_created",
      onMatch: (envelope) => {
        const kind = (envelope.payload as NotificationCreatedPayload | undefined)?.kind;
        if (kind && DISCIPLINE_NOTIFICATION_KINDS.includes(kind)) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.inboxCounts() });
        }
      },
      resync: () => undefined,
    });
  }, [warningLetters, registerListener, queryClient]);
}
