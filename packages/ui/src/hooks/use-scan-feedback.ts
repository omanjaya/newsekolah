import { useCallback, useRef } from "react";

export interface ScanFeedback {
  /** A short high tone plus a single short vibration. */
  playSuccess: () => void;
  /** A short low double-tone plus a double vibration. */
  playError: () => void;
}

type ToneStep = readonly [frequency: number, durationMs: number];

const SUCCESS_TONE: readonly ToneStep[] = [[880, 90]];
const ERROR_TONE: readonly ToneStep[] = [
  [220, 90],
  [180, 120],
];

/**
 * Sound and vibration for a barcode-scan result, matching the reference
 * scanner pattern (docs/07-ui-ux.md "Scanner: ... umpan balik getar/bunyi
 * /warna") used by the library desk's continuous scan flow and any future
 * scan-heavy screen (gate, satpam). Every browser call is wrapped: a
 * kiosk running with sound muted, no `AudioContext`, or no `navigator.
 * vibrate` (desktop Chrome, most of Safari) must never throw and never
 * block the caller's own visual feedback.
 *
 * One `AudioContext` is created lazily on first use and reused -- Safari
 * limits how many contexts a page may open, and creating one per scan on
 * a busy desk would exhaust that limit within a single circulation
 * session.
 */
export function useScanFeedback(): ScanFeedback {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback((): AudioContext | null => {
    if (audioCtxRef.current) return audioCtxRef.current;
    try {
      // Read through an untyped view instead of `window.AudioContext`: lib.dom.d.ts
      // declares that property as always present, which is only a compile-time
      // promise -- desktop Safari has no AudioContext at all (only the
      // webkitAudioContext this also checks), and it does not exist in the
      // jsdom test environment either.
      const win = window as unknown as Record<string, unknown>;
      const Ctor = (win.AudioContext ?? win.webkitAudioContext) as typeof AudioContext | undefined;
      if (!Ctor) return null;
      const ctx = new Ctor();
      audioCtxRef.current = ctx;
      return ctx;
    } catch {
      return null;
    }
  }, []);

  const playTones = useCallback(
    (tones: readonly ToneStep[]) => {
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        if (ctx.state === "suspended") void ctx.resume();
        let startAt = ctx.currentTime;
        for (const [frequency, durationMs] of tones) {
          const oscillator = ctx.createOscillator();
          const gain = ctx.createGain();
          oscillator.type = "sine";
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0.001, startAt);
          gain.gain.exponentialRampToValueAtTime(0.2, startAt + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, startAt + durationMs / 1000);
          oscillator.connect(gain);
          gain.connect(ctx.destination);
          oscillator.start(startAt);
          oscillator.stop(startAt + durationMs / 1000 + 0.02);
          startAt += durationMs / 1000 + 0.03;
        }
      } catch {
        // A locked-down audio permission or an exhausted context must
        // never break the scan itself -- the visual feedback still shows.
      }
    },
    [getAudioContext],
  );

  const vibrate = useCallback((pattern: number | number[]) => {
    try {
      // Same untyped-view reasoning as getAudioContext above: lib.dom.d.ts
      // declares navigator.vibrate as always present, but desktop Safari and
      // desktop Chrome both lack it at runtime.
      const vibrateFn = (navigator as unknown as Record<string, unknown>).vibrate as
        ((pattern: number | number[]) => boolean) | undefined;
      vibrateFn?.(pattern);
    } catch {
      // Not every device honors this, and some throw in embedded webviews.
    }
  }, []);

  const playSuccess = useCallback(() => {
    playTones(SUCCESS_TONE);
    vibrate(40);
  }, [playTones, vibrate]);

  const playError = useCallback(() => {
    playTones(ERROR_TONE);
    vibrate([40, 60, 40]);
  }, [playTones, vibrate]);

  return { playSuccess, playError };
}
