import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { useOffsetPage } from "./use-offset-page";

describe("useOffsetPage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/list");
  });

  it("starts on page 1 at offset 0", () => {
    const { result } = renderHook(() => useOffsetPage(50));

    expect(result.current).toMatchObject({ page: 1, limit: 50, offset: 0, hasPrevious: false });
  });

  it("moves between pages through the URL", () => {
    const { result } = renderHook(() => useOffsetPage(50));

    act(() => {
      result.current.goNext();
    });
    expect(result.current).toMatchObject({ page: 2, offset: 50, hasPrevious: true });
    expect(window.location.search).toBe("?page=2");

    act(() => {
      result.current.goPrevious();
    });
    expect(result.current.page).toBe(1);
    // Page 1 is the list itself: no `?page=1` left behind.
    expect(window.location.search).toBe("");
  });

  // Clearing the visits date filter reset the paging and ended on
  // /library/visits?page=1 instead of a clean /library/visits.
  it("resets without writing page=1 when no page was in the address", () => {
    window.history.replaceState(null, "", "/library/visits?from=2026-11-05");
    const { result } = renderHook(() => useOffsetPage(50));

    act(() => {
      result.current.resetPage();
    });
    expect(window.location.search).toBe("?from=2026-11-05");
    expect(result.current.page).toBe(1);
  });

  it("removes the page param when a reset leaves a later page", () => {
    window.history.replaceState(null, "", "/library/visits?from=2026-11-05&page=3");
    const { result } = renderHook(() => useOffsetPage(50));

    act(() => {
      result.current.resetPage();
    });
    expect(window.location.search).toBe("?from=2026-11-05");
    expect(result.current.page).toBe(1);
  });

  it("ignores an invalid page param", () => {
    window.history.replaceState(null, "", "/list?page=abc");
    const { result } = renderHook(() => useOffsetPage(50));

    expect(result.current.page).toBe(1);
  });

  it("uses its own param and resets without adding history", () => {
    window.history.replaceState(null, "", "/list?tab_page=4");
    const lengthBefore = window.history.length;
    const { result } = renderHook(() => useOffsetPage(20, "tab_page"));
    expect(result.current.offset).toBe(60);

    act(() => {
      result.current.resetPage();
    });
    expect(result.current.page).toBe(1);
    expect(window.history.length).toBe(lengthBefore);
  });

  it("offers a next page only when the page came back full", () => {
    const { result } = renderHook(() => useOffsetPage(50));

    expect(result.current.hasNextFor(50)).toBe(true);
    expect(result.current.hasNextFor(49)).toBe(false);
  });

  it("resets the page after a wrapped setter runs", () => {
    window.history.replaceState(null, "", "/list?page=3");
    const setter = vi.fn();
    const { result } = renderHook(() => useOffsetPage(50));

    act(() => {
      result.current.resetting(setter)("x");
    });
    expect(setter).toHaveBeenCalledWith("x");
    expect(result.current.page).toBe(1);
  });
});
