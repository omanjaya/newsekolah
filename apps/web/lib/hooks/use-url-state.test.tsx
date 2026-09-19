import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { useUrlState } from "./use-url-state";

const tabs = ["students", "teachers"] as const;

describe("useUrlState", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/school/classes?view=compact#roster");
  });

  it("preserves unrelated parameters and the hash when writing a value", () => {
    const { result } = renderHook(() => useUrlState("tab", tabs, "students"));

    act(() => {
      result.current[1]("teachers");
    });

    expect(window.location.href).toContain("view=compact");
    expect(window.location.href).toContain("tab=teachers");
    expect(window.location.hash).toBe("#roster");
  });

  it("uses the default for unknown values and follows browser history", () => {
    window.history.replaceState(null, "", "/school/classes?tab=unknown");
    const { result } = renderHook(() => useUrlState("tab", tabs, "students"));
    expect(result.current[0]).toBe("students");

    act(() => {
      window.history.pushState(null, "", "/school/classes?tab=teachers");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current[0]).toBe("teachers");
  });
});
