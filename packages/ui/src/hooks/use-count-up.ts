"use client";

import { motion } from "@newsekolah/ui-tokens/dist/tokens.ts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface UseCountUpOptions {
  /** Length of the count in ms. Defaults to the `slow` motion token (320ms). */
  duration?: number;
  /** Where the first count starts. Defaults to 0. */
  from?: number;
  /** Decimal places shown while counting. Defaults to the target's own. */
  decimals?: number;
  /**
   * Hold the count until the real number is known (e.g. `!isLoading`), so a
   * placeholder value does not use up the one count a mount gets.
   */
  enabled?: boolean;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * A count shorter than this is shown at once: counting 0 to 2 in 320ms
 * shows a wrong "1" for about 100ms and reads as a glitch, not a count.
 */
const MIN_COUNTED_DISTANCE = 10;

// Layout effect on the client so the starting value is in place before the
// first paint; plain effect on the server, where layout effects never run.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function decimalsOf(value: number): number {
  if (!Number.isFinite(value) || Number.isInteger(value)) return 0;
  return value.toString().split(".")[1]?.length ?? 0;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Fast start, gentle landing: close to the `enter` easing without a curve solver. */
function easeOut(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

/**
 * Counts a number up once, the first time it is known (a home-screen stat
 * tile settling on "96"). Later changes to `target` show immediately, and
 * so does a first value less than 10 away from `from`, whose few steps
 * would only flash wrong figures. Under `prefers-reduced-motion: reduce`
 * it never counts and always returns `target`. The returned value is a
 * number; format it at the call site.
 */
export function useCountUp(target: number, options: UseCountUpOptions = {}): number {
  const { duration = motion.duration.slow, from = 0, enabled = true } = options;
  const decimals = options.decimals ?? decimalsOf(target);
  const [value, setValue] = useState(target);
  const hasCounted = useRef(false);

  useIsomorphicLayoutEffect(() => {
    const canCount =
      enabled && Number.isFinite(target) && target !== from && duration > 0 && !hasCounted.current;
    if (!canCount) {
      setValue(target);
      return;
    }
    // The first known value uses up the mount's one count even when it is
    // shown at once, so a later, larger value does not count either.
    hasCounted.current = true;
    if (prefersReducedMotion() || Math.abs(target - from) < MIN_COUNTED_DISTANCE) {
      setValue(target);
      return;
    }

    let frame = 0;
    let startedAt: number | undefined;
    let finished = false;
    const step = (now: number) => {
      startedAt ??= now;
      const progress = Math.min(1, (now - startedAt) / duration);
      setValue(
        progress === 1 ? target : roundTo(from + (target - from) * easeOut(progress), decimals),
      );
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        finished = true;
      }
    };
    setValue(from);
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      // An interrupted count (Strict Mode's double mount, or the target
      // changing mid-way) has not been seen yet, so the next run counts again.
      if (!finished) hasCounted.current = false;
    };
  }, [target, from, duration, decimals, enabled]);

  return value;
}
