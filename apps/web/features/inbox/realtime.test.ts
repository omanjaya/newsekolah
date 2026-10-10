import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Registration {
  eventTypes: readonly string[];
  queryKeys: readonly unknown[][];
}

interface Listener {
  matches: (type: string) => boolean;
  onMatch: (envelope: { type: string; payload?: unknown }) => void;
}

const state = vi.hoisted(() => ({
  registrations: [] as Registration[],
  queueHooks: [] as [string, boolean][],
  listeners: [] as Listener[],
  invalidate: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));
vi.mock("../../lib/realtime/use-live-invalidate", () => ({
  useLiveInvalidate: (eventTypes: readonly string[], queryKeys: readonly unknown[][]) => {
    state.registrations.push({ eventTypes, queryKeys });
  },
}));
vi.mock("../../lib/realtime/live-socket-provider", () => ({
  useLiveSocketContext: () => ({
    registerListener: (listener: Listener) => {
      state.listeners.push(listener);
      return () => undefined;
    },
  }),
}));
vi.mock("../permits/realtime", () => ({
  LEAVE_REQUEST_QUEUE_EVENTS: ["leave_request.submitted", "leave_request.reviewed"],
  EXIT_PERMIT_QUEUE_EVENTS: ["exit_permit.stage_changed"],
  LATE_ARRIVAL_EVENTS: ["late_arrival.opened"],
  useLeaveReviewQueueLive: (enabled: boolean) => state.queueHooks.push(["leave", enabled]),
  useExitPermitReviewQueueLive: (enabled: boolean) => state.queueHooks.push(["exit", enabled]),
  useLateArrivalQueueLive: (enabled: boolean) => state.queueHooks.push(["late", enabled]),
}));

import { useInboxCountsLive } from "./realtime";

const COUNTS_KEY = ["inbox", "counts"];
const all = { leave: true, exit: true, late: true, warningLetters: true };
const none = { leave: false, exit: false, late: false, warningLetters: false };

beforeEach(() => {
  state.registrations = [];
  state.queueHooks = [];
  state.listeners = [];
  state.invalidate.mockReset();
});

describe("useInboxCountsLive", () => {
  it("invalidates the counts on every permit queue event the reader can act on", () => {
    renderHook(() => {
      useInboxCountsLive(all, true);
    });
    expect(state.registrations).toEqual([
      {
        eventTypes: ["leave_request.submitted", "leave_request.reviewed"],
        queryKeys: [COUNTS_KEY],
      },
      { eventTypes: ["exit_permit.stage_changed"], queryKeys: [COUNTS_KEY] },
      { eventTypes: ["late_arrival.opened"], queryKeys: [COUNTS_KEY] },
    ]);
  });

  it("subscribes the same duty topics the queues do, per access", () => {
    renderHook(() => {
      useInboxCountsLive({ ...none, exit: true }, true);
    });
    expect(state.queueHooks).toEqual([
      ["leave", false],
      ["exit", true],
      ["late", false],
    ]);
    expect(state.registrations.map((r) => r.queryKeys.length)).toEqual([0, 1, 0]);
  });

  it("registers nothing for a display-only reader", () => {
    renderHook(() => {
      useInboxCountsLive(all, false);
    });
    expect(state.queueHooks.every(([, enabled]) => !enabled)).toBe(true);
    expect(state.registrations.every((r) => r.queryKeys.length === 0)).toBe(true);
    expect(state.listeners).toHaveLength(0);
  });

  it("invalidates on a discipline notification, and only for warning-letter issuers", () => {
    renderHook(() => {
      useInboxCountsLive({ ...none, leave: true }, true);
    });
    expect(state.listeners).toHaveLength(0);

    renderHook(() => {
      useInboxCountsLive(all, true);
    });
    const [listener] = state.listeners;
    expect(listener?.matches("notification_created")).toBe(true);
    expect(listener?.matches("leave_request.submitted")).toBe(false);

    listener?.onMatch({
      type: "notification_created",
      payload: { kind: "announcement_published" },
    });
    expect(state.invalidate).not.toHaveBeenCalled();

    listener?.onMatch({
      type: "notification_created",
      payload: { kind: "discipline_threshold_reached" },
    });
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: COUNTS_KEY });
  });
});
