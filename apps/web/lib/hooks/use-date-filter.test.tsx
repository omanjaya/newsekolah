import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { useDateFilter } from "./use-date-filter";

describe("URL date filters", () => {
  it("rejects impossible dates and retains unrelated URL context", () => {
    window.history.replaceState(null, "", "/attendance?date=2026-02-31&tab=daily#rows");
    const { result } = renderHook(() => useDateFilter("date", "2026-09-18"));
    expect(result.current[0]).toBe("2026-09-18");
    act(() => {
      result.current[1]("2026-02-30");
    });
    expect(result.current[0]).toBe("2026-09-18");
    act(() => {
      result.current[1]("2026-02-28");
    });
    expect(window.location.search).toContain("tab=daily");
    expect(window.location.hash).toBe("#rows");
    expect(result.current[0]).toBe("2026-02-28");
  });
  it("supports functional next/previous-day updates without duplicate history writes", () => {
    window.history.replaceState(null, "", "/attendance?date=2026-09-18");
    const { result } = renderHook(() => useDateFilter("date", "2026-09-18"));
    const length = window.history.length;
    act(() => {
      result.current[1]((value) => value);
    });
    expect(window.history.length).toBe(length);
    act(() => {
      result.current[1](() => "2026-09-19");
    });
    expect(result.current[0]).toBe("2026-09-19");
  });
});
