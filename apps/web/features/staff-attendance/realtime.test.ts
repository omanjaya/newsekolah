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

import { useStaffAttendanceTodayLive } from "./realtime";

beforeEach(() => {
  state.registrations = [];
  state.topicCalls = [];
  state.me = undefined;
});

describe("useStaffAttendanceTodayLive", () => {
  it("subscribes role:admin and role:principal (never role:hr, never removed) and registers staff_attendance.scanned", () => {
    state.me = {
      roles: [
        { id: "1", slug: "admin", name: "Admin", is_primary: true },
        { id: "2", slug: "principal", name: "Principal", is_primary: false },
      ],
    };
    renderHook(() => {
      useStaffAttendanceTodayLive("2026-09-25");
    });

    expect(state.topicCalls).toContain("role:admin");
    expect(state.topicCalls).toContain("role:principal");
    expect(state.registrations[0]?.eventTypes).toEqual(["staff_attendance.scanned"]);
    expect(state.registrations[0]?.queryKeys).toContainEqual([
      "staff-attendance",
      "today",
      "2026-09-25",
    ]);
  });

  it("does not subscribe for a plain staff account", () => {
    state.me = { roles: [{ id: "1", slug: "staff", name: "Staff", is_primary: true }] };
    renderHook(() => {
      useStaffAttendanceTodayLive("2026-09-25");
    });

    expect(state.topicCalls).toEqual([undefined, undefined]);
  });

  it("does not subscribe while the date is empty", () => {
    state.me = { roles: [{ id: "1", slug: "admin", name: "Admin", is_primary: true }] };
    renderHook(() => {
      useStaffAttendanceTodayLive("");
    });

    expect(state.topicCalls).not.toContain("role:admin");
  });
});
