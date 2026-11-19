import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { useDateRangeFilter } from "./use-date-range-filter";

const query = () => new URLSearchParams(window.location.search);

describe("useDateRangeFilter", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/settings/audit-logs?entity_type=role");
  });

  // Two separate writes left a from-only filter one Back step away.
  it("writes both bounds in one history entry", () => {
    const { result } = renderHook(() => useDateRangeFilter());
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");

    act(() => {
      result.current[1]({ from: "2026-11-14", to: "2026-11-20" });
    });

    expect(push).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
    expect(query().get("from")).toBe("2026-11-14");
    expect(query().get("to")).toBe("2026-11-20");
    expect(query().get("entity_type")).toBe("role");
    expect(result.current[0]).toEqual({ from: "2026-11-14", to: "2026-11-20" });
    push.mockRestore();
    replace.mockRestore();
  });

  it("drops an unset bound's key and skips a write that changes nothing", () => {
    window.history.replaceState(null, "", "/x?from=2026-11-14&to=2026-11-20");
    const { result } = renderHook(() => useDateRangeFilter());
    const push = vi.spyOn(window.history, "pushState");

    act(() => {
      result.current[1]({ from: "2026-11-14", to: "2026-11-20" });
    });
    expect(push).not.toHaveBeenCalled();

    act(() => {
      result.current[1]({ from: "2026-11-14", to: "" });
    });
    expect(push).toHaveBeenCalledTimes(1);
    expect(query().get("from")).toBe("2026-11-14");
    expect(query().has("to")).toBe(false);
    push.mockRestore();
  });

  it("can replace the current entry instead of adding one", () => {
    const { result } = renderHook(() => useDateRangeFilter());
    const push = vi.spyOn(window.history, "pushState");

    act(() => {
      result.current[1]({ from: "2026-11-01", to: "2026-11-02" }, { replace: true });
    });

    expect(push).not.toHaveBeenCalled();
    expect(query().get("from")).toBe("2026-11-01");
    push.mockRestore();
  });

  it("reads a reversed range from a shared link in calendar order", () => {
    window.history.replaceState(null, "", "/x?from=2026-11-19&to=2026-11-01");
    const { result } = renderHook(() => useDateRangeFilter());
    expect(result.current[0]).toEqual({ from: "2026-11-01", to: "2026-11-19" });
  });

  it("falls back to the page's default period for a missing or invalid bound", () => {
    window.history.replaceState(null, "", "/x?from=2026-02-31");
    const { result } = renderHook(() =>
      useDateRangeFilter({ defaultFrom: "2026-11-01", defaultTo: "2026-11-19" }),
    );
    expect(result.current[0]).toEqual({ from: "2026-11-01", to: "2026-11-19" });

    // A bound cleared to "" is not a valid value when the page has a default.
    act(() => {
      result.current[1]({ from: "", to: "2026-11-10" });
    });
    expect(query().get("from")).toBe("2026-02-31");
    expect(query().get("to")).toBe("2026-11-10");
  });
});
