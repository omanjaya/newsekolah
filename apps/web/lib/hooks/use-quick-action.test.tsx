import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useQuickAction } from "./use-quick-action";

describe("useQuickAction", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/leave-requests?type=leave&quick=submit-leave#top");
  });

  it("starts the matching action once and strips only its own parameter", () => {
    const start = vi.fn();
    renderHook(() => {
      useQuickAction("submit-leave", start);
    });

    expect(start).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?type=leave");
    expect(window.location.hash).toBe("#top");
  });

  it("hands the history API a string URL, which a Worker can clone", () => {
    // See use-url-state.test.tsx: a wrapped history API posts this
    // argument to a Worker, which cannot clone a URL object.
    const replace = vi.spyOn(window.history, "replaceState");
    renderHook(() => {
      useQuickAction("submit-leave", vi.fn());
    });

    expect(replace).toHaveBeenCalledTimes(1);
    expect(typeof replace.mock.calls[0]?.[2]).toBe("string");
    replace.mockRestore();
  });

  it("ignores a different action and leaves the URL alone", () => {
    const start = vi.fn();
    renderHook(() => {
      useQuickAction("record-violation", start);
    });

    expect(start).not.toHaveBeenCalled();
    expect(window.location.search).toContain("quick=submit-leave");
  });

  it("waits while disabled, then fires when enabled", () => {
    const start = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }) => {
        useQuickAction("submit-leave", start, enabled);
      },
      { initialProps: { enabled: false } },
    );
    expect(start).not.toHaveBeenCalled();

    rerender({ enabled: true });
    expect(start).toHaveBeenCalledTimes(1);
  });
});
