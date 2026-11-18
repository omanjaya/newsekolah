import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCountUp } from "./use-count-up.js";

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useCountUp", () => {
  it("counts from zero to the target over the duration", () => {
    stubReducedMotion(false);
    const { result } = renderHook(() => useCountUp(96, { duration: 320 }));
    expect(result.current).toBe(0);

    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(96);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe(96);
  });

  it("shows the target at once under reduced motion", () => {
    stubReducedMotion(true);
    const { result } = renderHook(() => useCountUp(96));
    expect(result.current).toBe(96);
  });

  it("counts only once: a later target shows immediately", () => {
    stubReducedMotion(false);
    const { result, rerender } = renderHook(({ value }) => useCountUp(value, { duration: 100 }), {
      initialProps: { value: 10 },
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe(10);

    rerender({ value: 25 });
    expect(result.current).toBe(25);
  });

  it("waits while disabled, then counts once the real number arrives", () => {
    stubReducedMotion(false);
    const { result, rerender } = renderHook(
      ({ value, enabled }) => useCountUp(value, { duration: 100, enabled }),
      { initialProps: { value: 0, enabled: false } },
    );
    expect(result.current).toBe(0);

    rerender({ value: 40, enabled: true });
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe(40);
  });

  it("keeps the target's decimal places while counting", () => {
    stubReducedMotion(false);
    const { result } = renderHook(() => useCountUp(45.5, { duration: 320 }));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBeLessThan(45.5);
    expect(Math.abs(result.current * 10 - Math.round(result.current * 10))).toBeLessThan(1e-9);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe(45.5);
  });

  // Counting 0 to 2 in 320ms flashes a wrong "1" for about 100ms.
  it("shows a small number at once instead of counting through wrong figures", () => {
    stubReducedMotion(false);
    const { result, rerender } = renderHook(({ value }) => useCountUp(value, { duration: 320 }), {
      initialProps: { value: 2 },
    });
    expect(result.current).toBe(2);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(2);

    // That first value used up the count: a later one shows immediately.
    rerender({ value: 96 });
    expect(result.current).toBe(96);
  });
});
