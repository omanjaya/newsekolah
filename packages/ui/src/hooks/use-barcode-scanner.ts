import { useEffect, useRef } from "react";

import { createDuplicateScanGuard } from "./duplicate-scan-guard.js";

export type BarcodeScanSource = "scanner" | "manual" | "camera";

export interface BarcodeScanEvent {
  code: string;
  source: BarcodeScanSource;
  at: number;
}

export interface UseBarcodeScannerOptions {
  /** Called once a keystroke burst is recognized as a scan. */
  onScan: (event: BarcodeScanEvent) => void;
  /**
   * A code shorter than this is treated as accidental input, not a scan
   * (a stray Enter press, or a single misplaced keystroke). Default 3.
   */
  minLength?: number;
  /**
   * The average gap between keystrokes, in ms, below which a burst counts
   * as scanner speed rather than a person typing. A hardware scanner
   * emits a whole code in a handful of milliseconds; even a fast typist
   * rarely sustains under ~60ms per character. Default 30.
   */
  maxAverageIntervalMs?: number;
  /** A gap longer than this between keystrokes starts a new burst. Default 500. */
  burstResetMs?: number;
  /** Same code read again inside this window is suppressed. Default 1500. */
  duplicateWindowMs?: number;
  /** Set false to stop listening, e.g. while a dialog with its own text entry is open. Default true. */
  enabled?: boolean;
  /** Injectable for tests; defaults to `window`. */
  target?: EventTarget;
  /** Injectable for tests; defaults to `Date.now`. */
  now?: () => number;
}

const DEFAULTS = {
  minLength: 3,
  maxAverageIntervalMs: 30,
  burstResetMs: 500,
  duplicateWindowMs: 1500,
};

/**
 * The scan-versus-typing decision, extracted as a pure function so the
 * timing rule can be unit tested without going through DOM event
 * dispatch. `intervals` is the gap in ms between each keystroke and the
 * one before it (length = keystrokes.length - 1, since the first
 * keystroke has no prior one to measure from).
 */
export function isScanBurst(
  charCount: number,
  intervals: number[],
  options: { minLength: number; maxAverageIntervalMs: number },
): boolean {
  if (charCount < options.minLength) return false;
  if (intervals.length === 0) return false;
  const average = intervals.reduce((sum, gap) => sum + gap, 0) / intervals.length;
  return average <= options.maxAverageIntervalMs;
}

/**
 * Listens for barcode scanner input anywhere on the page: a physical
 * scanner behaves like a very fast keyboard typing a code and ending with
 * Enter, whether or not any particular field has focus. Ordinary human
 * typing that happens to end with Enter (a search box, a form field) is
 * left alone -- the timing between keystrokes is what tells the two apart,
 * not which element is focused.
 */
export function useBarcodeScanner(options: UseBarcodeScannerOptions): void {
  const {
    onScan,
    minLength = DEFAULTS.minLength,
    maxAverageIntervalMs = DEFAULTS.maxAverageIntervalMs,
    burstResetMs = DEFAULTS.burstResetMs,
    duplicateWindowMs = DEFAULTS.duplicateWindowMs,
    enabled = true,
    target,
    now = Date.now,
  } = options;

  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    const eventTarget = target ?? window;
    const guard = createDuplicateScanGuard(duplicateWindowMs);

    let chars: string[] = [];
    let times: number[] = [];

    const reset = () => {
      chars = [];
      times = [];
    };

    const handleKeyDown = (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.ctrlKey || keyboardEvent.altKey || keyboardEvent.metaKey) {
        reset();
        return;
      }

      const at = now();
      const lastAt = times[times.length - 1];
      if (lastAt !== undefined && at - lastAt > burstResetMs) {
        reset();
      }

      if (keyboardEvent.key === "Enter") {
        const code = chars.join("");
        const intervals: number[] = [];
        let previous: number | undefined;
        for (const t of times) {
          if (previous !== undefined) intervals.push(t - previous);
          previous = t;
        }
        if (isScanBurst(code.length, intervals, { minLength, maxAverageIntervalMs })) {
          if (guard.accept(code, at)) {
            onScanRef.current({ code, source: "scanner", at });
          }
        }
        reset();
        return;
      }

      if (keyboardEvent.key.length === 1) {
        chars.push(keyboardEvent.key);
        times.push(at);
      } else {
        // A named key other than Enter (Tab, Shift, arrow keys, ...)
        // breaks the burst without discarding characters already read,
        // since scanners sometimes emit a benign key like Shift.
        return;
      }
    };

    eventTarget.addEventListener("keydown", handleKeyDown);
    return () => {
      eventTarget.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, target, now, minLength, maxAverageIntervalMs, burstResetMs, duplicateWindowMs]);
}
