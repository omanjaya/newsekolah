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

import { useAdminDashboardLive } from "./realtime";

beforeEach(() => {
  state.registrations = [];
  state.topicCalls = [];
  state.me = undefined;
});

describe("useAdminDashboardLive", () => {
  it("subscribes role:admin for an admin and registers attendance.submitted", () => {
    state.me = { roles: [{ id: "1", slug: "admin", name: "Admin", is_primary: true }] };
    renderHook(() => {
      useAdminDashboardLive(true);
    });

    expect(state.topicCalls).toContain("role:admin");
    expect(state.topicCalls).not.toContain("role:principal");
    expect(state.registrations[0]?.eventTypes).toEqual(["attendance.submitted"]);
    expect(state.registrations[0]?.queryKeys).toContainEqual(["analytics", "admin-dashboard"]);
  });

  it("subscribes role:principal for a principal", () => {
    state.me = { roles: [{ id: "1", slug: "principal", name: "Principal", is_primary: true }] };
    renderHook(() => {
      useAdminDashboardLive(true);
    });

    expect(state.topicCalls).toContain("role:principal");
    expect(state.topicCalls).not.toContain("role:admin");
  });

  it("never subscribes for a super_admin who does not also hold admin/principal", () => {
    state.me = { roles: [{ id: "1", slug: "super_admin", name: "Super admin", is_primary: true }] };
    renderHook(() => {
      useAdminDashboardLive(true);
    });

    expect(state.topicCalls).toEqual([undefined, undefined]);
  });

  it("does not subscribe while disabled", () => {
    state.me = { roles: [{ id: "1", slug: "admin", name: "Admin", is_primary: true }] };
    renderHook(() => {
      useAdminDashboardLive(false);
    });

    expect(state.topicCalls).not.toContain("role:admin");
  });
});
