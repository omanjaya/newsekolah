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

  it("hands the history API a string URL, which a Worker can clone", () => {
    // The service worker's navigation cache wraps pushState/replaceState
    // and posts the URL argument to a Worker; a URL object there throws
    // DataCloneError on every write.
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    const { result } = renderHook(() => useUrlState("tab", tabs, "students"));

    act(() => {
      result.current[1]("teachers");
    });
    act(() => {
      result.current[2]("students");
    });

    expect(push).toHaveBeenCalledTimes(1);
    expect(typeof push.mock.calls[0]?.[2]).toBe("string");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(typeof replace.mock.calls[0]?.[2]).toBe("string");
    expect(window.location.search).toBe("?view=compact&tab=students");
    push.mockRestore();
    replace.mockRestore();
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
