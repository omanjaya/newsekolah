import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDuplicateScanGuard } from "./duplicate-scan-guard.js";
import { isScanBurst, useBarcodeScanner } from "./use-barcode-scanner.js";

/** Dispatches one keydown per character, `gapMs` apart, then Enter. */
function typeAndEnter(target: EventTarget, code: string, gapMs: number, clock: { t: number }) {
  for (const char of code) {
    clock.t += gapMs;
    target.dispatchEvent(new KeyboardEvent("keydown", { key: char }));
  }
  clock.t += gapMs;
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
}

describe("isScanBurst", () => {
  it("accepts a fast, sufficiently long burst", () => {
    expect(isScanBurst(8, [5, 4, 6, 5, 5, 4, 5], { minLength: 3, maxAverageIntervalMs: 30 })).toBe(
      true,
    );
  });

  it("rejects human typing speed", () => {
    expect(
      isScanBurst(8, [120, 140, 95, 200, 110, 130, 150], {
        minLength: 3,
        maxAverageIntervalMs: 30,
      }),
    ).toBe(false);
  });

  it("rejects a code shorter than the minimum length even if fast", () => {
    expect(isScanBurst(2, [4], { minLength: 3, maxAverageIntervalMs: 30 })).toBe(false);
  });

  it("rejects a single keystroke with no interval to measure", () => {
    expect(isScanBurst(5, [], { minLength: 3, maxAverageIntervalMs: 30 })).toBe(false);
  });
});

describe("useBarcodeScanner", () => {
  const target = new EventTarget();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports a fast keystroke burst ending in Enter as a scan", () => {
    const onScan = vi.fn();
    const clock = { t: 0 };
    renderHook(() => {
      useBarcodeScanner({ onScan, target, now: () => clock.t, duplicateWindowMs: 1000 });
    });

    typeAndEnter(target, "8991234567", 5, clock);

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith(
      expect.objectContaining({ code: "8991234567", source: "scanner" }),
    );
  });

  it("does not report ordinary human typing speed as a scan", () => {
    const onScan = vi.fn();
    const clock = { t: 0 };
    renderHook(() => {
      useBarcodeScanner({ onScan, target, now: () => clock.t, duplicateWindowMs: 1000 });
    });

    typeAndEnter(target, "8991234567", 150, clock);

    expect(onScan).not.toHaveBeenCalled();
  });

  it("ignores a burst shorter than the minimum length", () => {
    const onScan = vi.fn();
    const clock = { t: 0 };
    renderHook(() => {
      useBarcodeScanner({ onScan, target, now: () => clock.t, minLength: 4 });
    });

    typeAndEnter(target, "12", 5, clock);

    expect(onScan).not.toHaveBeenCalled();
  });

  it("suppresses a repeat of the same code inside the duplicate window", () => {
    const onScan = vi.fn();
    const clock = { t: 0 };
    renderHook(() => {
      useBarcodeScanner({ onScan, target, now: () => clock.t, duplicateWindowMs: 1000 });
    });

    typeAndEnter(target, "8991234567", 5, clock);
    clock.t += 200; // well inside the 1000ms duplicate window
    typeAndEnter(target, "8991234567", 5, clock);

    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it("accepts the same code again once the duplicate window has passed", () => {
    const onScan = vi.fn();
    const clock = { t: 0 };
    renderHook(() => {
      useBarcodeScanner({ onScan, target, now: () => clock.t, duplicateWindowMs: 100 });
    });

    typeAndEnter(target, "8991234567", 5, clock);
    clock.t += 500; // past the 100ms duplicate window
    typeAndEnter(target, "8991234567", 5, clock);

    expect(onScan).toHaveBeenCalledTimes(2);
  });

  it("accepts a different code immediately, even inside the duplicate window", () => {
    const onScan = vi.fn();
    const clock = { t: 0 };
    renderHook(() => {
      useBarcodeScanner({ onScan, target, now: () => clock.t, duplicateWindowMs: 1000 });
    });

    typeAndEnter(target, "1111111111", 5, clock);
    clock.t += 50;
    typeAndEnter(target, "2222222222", 5, clock);

    expect(onScan).toHaveBeenCalledTimes(2);
  });

  it("does nothing while disabled", () => {
    const onScan = vi.fn();
    const clock = { t: 0 };
    renderHook(() => {
      useBarcodeScanner({ onScan, target, now: () => clock.t, enabled: false });
    });

    typeAndEnter(target, "8991234567", 5, clock);

    expect(onScan).not.toHaveBeenCalled();
  });

  it("resets the buffer after a long pause, so a slow prefix does not merge into a later fast burst", () => {
    const onScan = vi.fn();
    const clock = { t: 0 };
    renderHook(() => {
      useBarcodeScanner({ onScan, target, now: () => clock.t, burstResetMs: 500 });
    });

    // A few slow keystrokes, a long pause, then a genuine fast scan.
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "9" }));
    clock.t += 200;
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "9" }));
    clock.t += 900; // exceeds burstResetMs, starts a new burst
    typeAndEnter(target, "1234567890", 5, clock);

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith(expect.objectContaining({ code: "1234567890" }));
  });
});

describe("createDuplicateScanGuard", () => {
  it("suppresses the same code within the window and allows it again after", () => {
    const guard = createDuplicateScanGuard(100);
    expect(guard.accept("A1", 0)).toBe(true);
    expect(guard.accept("A1", 50)).toBe(false);
    expect(guard.accept("A1", 150)).toBe(true);
  });

  it("never suppresses a different code", () => {
    const guard = createDuplicateScanGuard(1000);
    expect(guard.accept("A1", 0)).toBe(true);
    expect(guard.accept("B2", 1)).toBe(true);
  });

  it("resets its memory on demand", () => {
    const guard = createDuplicateScanGuard(1000);
    expect(guard.accept("A1", 0)).toBe(true);
    guard.reset();
    expect(guard.accept("A1", 1)).toBe(true);
  });
});
