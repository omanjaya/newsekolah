import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Registration {
  eventTypes: readonly string[];
  queryKeys: readonly unknown[][];
}

interface TestState {
  registrations: Registration[];
  topicCalls: (string | undefined)[];
  me: unknown;
}

const state = vi.hoisted<TestState>(() => ({
  registrations: [],
  topicCalls: [],
  me: undefined,
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
}));

vi.mock("../../lib/session/session-provider", () => ({
  useSession: () => ({ me: state.me }),
}));

import { useVisitorBoardLive } from "./realtime";

beforeEach(() => {
  state.registrations = [];
  state.topicCalls = [];
  state.me = undefined;
});

describe("useVisitorBoardLive", () => {
  it("subscribes every held role among staff/principal/admin and registers both check-in events", () => {
    state.me = {
      roles: [
        { id: "1", slug: "staff", name: "Staff", is_primary: true },
        { id: "2", slug: "principal", name: "Principal", is_primary: false },
      ],
    };
    renderHook(() => {
      useVisitorBoardLive();
    });

    expect(state.topicCalls).toContain("role:staff");
    expect(state.topicCalls).toContain("role:principal");
    expect(state.topicCalls).not.toContain("role:admin");
    expect(state.registrations[0]?.eventTypes).toEqual([
      "visitor.checked_in",
      "visitor.checked_out",
    ]);
    expect(state.registrations[0]?.queryKeys).toContainEqual(["visitors", "board"]);
  });

  it("subscribes nothing for a role that never sees the gate board", () => {
    state.me = { roles: [{ id: "1", slug: "teacher", name: "Teacher", is_primary: true }] };
    renderHook(() => {
      useVisitorBoardLive();
    });

    expect(state.topicCalls).toEqual([undefined, undefined, undefined]);
  });
});
