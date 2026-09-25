import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Registration {
  eventTypes: readonly string[];
  queryKeys: readonly unknown[][];
}

const state = vi.hoisted(() => ({ registrations: [] as Registration[] }));

vi.mock("../../lib/realtime/use-live-invalidate", () => ({
  useLiveInvalidate: (eventTypes: readonly string[], queryKeys: readonly unknown[][]) => {
    state.registrations.push({ eventTypes, queryKeys });
  },
}));

import { useMyGradesLive } from "./realtime";

beforeEach(() => {
  state.registrations = [];
});

describe("useMyGradesLive", () => {
  it("registers grading.published against the my-grades query key prefix, no topic subscription", () => {
    renderHook(() => {
      useMyGradesLive();
    });

    expect(state.registrations[0]?.eventTypes).toEqual(["grading.published"]);
    expect(state.registrations[0]?.queryKeys).toContainEqual(["grading", "my-grades"]);
  });
});
