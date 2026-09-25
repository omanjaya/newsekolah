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

import { useLibraryDashboardLive, useMemberReservationsLive } from "./realtime";

beforeEach(() => {
  state.registrations = [];
  state.topicCalls = [];
  state.me = undefined;
});

const RESERVATION_EVENTS = ["library.reserved", "library.reservation_ready"];

describe("useLibraryDashboardLive", () => {
  it("subscribes role:librarian for a librarian and registers both reservation events", () => {
    state.me = { roles: [{ id: "1", slug: "librarian", name: "Librarian", is_primary: true }] };
    renderHook(() => {
      useLibraryDashboardLive();
    });

    expect(state.topicCalls).toContain("role:librarian");
    expect(state.registrations[0]?.eventTypes).toEqual(RESERVATION_EVENTS);
    expect(state.registrations[0]?.queryKeys).toContainEqual(["library", "dashboard"]);
  });

  it("does not subscribe for a non-librarian viewing the dashboard", () => {
    state.me = { roles: [{ id: "1", slug: "admin", name: "Admin", is_primary: true }] };
    renderHook(() => {
      useLibraryDashboardLive();
    });

    expect(state.topicCalls).not.toContain("role:librarian");
  });
});

describe("useMemberReservationsLive", () => {
  it("registers both reservation events against that member's own reservations key", () => {
    state.me = { roles: [{ id: "1", slug: "librarian", name: "Librarian", is_primary: true }] };
    renderHook(() => {
      useMemberReservationsLive("member-1");
    });

    expect(state.topicCalls).toContain("role:librarian");
    expect(state.registrations[0]?.queryKeys).toContainEqual([
      "library",
      "members",
      "member-1",
      "reservations",
    ]);
  });

  it("does not subscribe while no member is selected", () => {
    state.me = { roles: [{ id: "1", slug: "librarian", name: "Librarian", is_primary: true }] };
    renderHook(() => {
      useMemberReservationsLive("");
    });

    expect(state.topicCalls).not.toContain("role:librarian");
  });
});
