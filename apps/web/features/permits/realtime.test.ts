import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Registration {
  eventTypes: readonly string[];
  queryKeys: readonly unknown[][];
}

/**
 * Isolates the hooks in ./realtime from LiveSocketProvider's actual
 * WebSocket/timer machinery and from SessionProvider's `/v1/me` round
 * trip (both already covered elsewhere -- see
 * lib/realtime/live-socket-provider.test.tsx and
 * late-arrival-queue.realtime.test.tsx for the one end-to-end case), and
 * only checks that each hook registers the right event types, query keys,
 * and role/duty topics for a given session shape.
 */
interface TestState {
  registrations: Registration[];
  topicCalls: (string | undefined)[];
  topicsCalls: (string | undefined)[][];
  me: unknown;
  can: Record<string, boolean>;
}

const state = vi.hoisted<TestState>(() => ({
  registrations: [],
  topicCalls: [],
  topicsCalls: [],
  me: undefined,
  can: {},
}));

vi.mock("../../lib/realtime/use-live-invalidate", () => ({
  useLiveInvalidate: (eventTypes: readonly string[], queryKeys: readonly unknown[][]) => {
    state.registrations.push({ eventTypes, queryKeys });
  },
}));

vi.mock("../../lib/realtime/use-live-topic", () => ({
  useLiveTopic: (topic: string | undefined) => {
    state.topicCalls.push(topic);
  },
  useLiveTopics: (topics: (string | undefined)[]) => {
    state.topicsCalls.push(topics);
  },
}));

vi.mock("../../lib/session/session-provider", () => ({
  useSession: () => ({ me: state.me }),
  useCan: (permission: string) => state.can[permission] ?? false,
}));

import {
  useExitPermitDetailLive,
  useExitPermitReviewQueueLive,
  useLateArrivalQueueLive,
  useLeaveReviewQueueLive,
  useLeaveRequestDetailLive,
  useMyExitPermitsLive,
  useMyLeaveRequestsLive,
} from "./realtime";

beforeEach(() => {
  state.registrations = [];
  state.topicCalls = [];
  state.topicsCalls = [];
  state.me = undefined;
  state.can = {};
});

describe("useLateArrivalQueueLive", () => {
  it("subscribes duty:picket for a teacher account and registers late_arrival.opened/.updated", () => {
    state.me = { profile_kind: "teacher" };
    renderHook(() => {
      useLateArrivalQueueLive(true);
    });

    expect(state.topicCalls).toContain("duty:picket");
    expect(state.registrations[0]?.eventTypes).toEqual([
      "late_arrival.opened",
      "late_arrival.updated",
    ]);
    expect(state.registrations[0]?.queryKeys).toContainEqual(["permits", "late-arrival-queue"]);
  });

  it("subscribes duty:picket for a staff account", () => {
    state.me = { profile_kind: "staff" };
    renderHook(() => {
      useLateArrivalQueueLive(true);
    });
    expect(state.topicCalls).toContain("duty:picket");
  });

  it("never subscribes for a student account", () => {
    state.me = { profile_kind: "student" };
    renderHook(() => {
      useLateArrivalQueueLive(true);
    });
    expect(state.topicCalls).not.toContain("duty:picket");
  });

  it("does not subscribe while the screen reports itself disabled", () => {
    state.me = { profile_kind: "teacher" };
    renderHook(() => {
      useLateArrivalQueueLive(false);
    });
    expect(state.topicCalls).not.toContain("duty:picket");
  });
});

describe("useExitPermitReviewQueueLive", () => {
  it("subscribes the three approval duties for an approver, not the gate's", () => {
    state.can = { issue_scan_tokens: true, scan_exit_permits: false };
    renderHook(() => {
      useExitPermitReviewQueueLive(true);
    });

    expect(state.topicCalls).toEqual(
      expect.arrayContaining(["duty:picket", "duty:counselor", "duty:leadership"]),
    );
    expect(state.topicCalls).not.toContain("duty:security");
  });

  it("subscribes duty:security for the gate, not the approval duties", () => {
    state.can = { issue_scan_tokens: false, scan_exit_permits: true };
    renderHook(() => {
      useExitPermitReviewQueueLive(true);
    });

    expect(state.topicCalls).toContain("duty:security");
    expect(state.topicCalls).not.toContain("duty:picket");
    expect(state.topicCalls).not.toContain("duty:counselor");
    expect(state.topicCalls).not.toContain("duty:leadership");
  });

  it("registers all four exit permit queue events against the review queue key", () => {
    renderHook(() => {
      useExitPermitReviewQueueLive(true);
    });

    expect(state.registrations[0]?.eventTypes).toEqual([
      "exit_permit.stage_changed",
      "exit_permit.issued",
      "exit_permit.gate_ready",
      "exit_permit.exited",
    ]);
    expect(state.registrations[0]?.queryKeys).toContainEqual([
      "permits",
      "exit-permit-review-queue",
    ]);
  });
});

describe("useMyExitPermitsLive and useExitPermitDetailLive", () => {
  it("registers the student's own exit permit events with no topic subscription (automatic user topic)", () => {
    renderHook(() => {
      useMyExitPermitsLive();
    });

    expect(state.topicCalls).toEqual([]);
    expect(state.registrations[0]?.eventTypes).toEqual([
      "exit_permit.stage_changed",
      "exit_permit.issued",
      "exit_permit.exited",
    ]);
    expect(state.registrations[0]?.queryKeys).toContainEqual(["permits", "exit-permits"]);
  });

  it("registers the same events against one exit permit's own detail key", () => {
    renderHook(() => {
      useExitPermitDetailLive("permit-1");
    });

    expect(state.registrations[0]?.queryKeys).toContainEqual([
      "permits",
      "exit-permit",
      "permit-1",
    ]);
  });
});

describe("useLeaveReviewQueueLive", () => {
  it("subscribes one duty:homeroom:<classID> topic per homeroom class, plus duty:counselor when held", () => {
    state.me = {
      duties: [
        { slug: "homeroom", scope_kind: "class", scope_id: "class-1" },
        { slug: "homeroom", scope_kind: "class", scope_id: "class-2" },
        { slug: "counselor", scope_kind: "school" },
      ],
    };
    renderHook(() => {
      useLeaveReviewQueueLive(true);
    });

    expect(state.topicsCalls).toContainEqual(["duty:homeroom:class-1", "duty:homeroom:class-2"]);
    expect(state.topicCalls).toContain("duty:counselor");
    expect(state.registrations[0]?.eventTypes).toEqual([
      "leave_request.submitted",
      "leave_request.reviewed",
    ]);
    expect(state.registrations[0]?.queryKeys).toContainEqual(["permits", "leave-review-queue"]);
  });

  it("subscribes nothing extra for a teacher with no homeroom or counselor duty", () => {
    state.me = { duties: [] };
    renderHook(() => {
      useLeaveReviewQueueLive(true);
    });

    expect(state.topicsCalls).toContainEqual([]);
    expect(state.topicCalls).not.toContain("duty:counselor");
  });
});

describe("useMyLeaveRequestsLive and useLeaveRequestDetailLive", () => {
  it("registers leave_request.reviewed/.issued against the student's own list", () => {
    renderHook(() => {
      useMyLeaveRequestsLive();
    });

    expect(state.registrations[0]?.eventTypes).toEqual([
      "leave_request.reviewed",
      "leave_request.issued",
    ]);
    expect(state.registrations[0]?.queryKeys).toContainEqual(["permits", "leave-requests"]);
  });

  it("registers the same events against one leave request's own detail key", () => {
    renderHook(() => {
      useLeaveRequestDetailLive("leave-1");
    });

    expect(state.registrations[0]?.queryKeys).toContainEqual([
      "permits",
      "leave-request",
      "leave-1",
    ]);
  });
});
