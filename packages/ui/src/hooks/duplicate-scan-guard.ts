/**
 * Suppresses a repeat read of the same code within a short window. A
 * physical scanner double-fires on a shaky hand, and a reader at the kiosk
 * can scan the same book twice before the first result renders; without
 * this, both would register as two separate loan actions.
 */
export interface DuplicateScanGuard {
  /** Returns true if `code` should be accepted, false if it is a repeat within the window. */
  accept: (code: string, at: number) => boolean;
  reset: () => void;
}

export function createDuplicateScanGuard(windowMs: number): DuplicateScanGuard {
  let lastCode: string | null = null;
  let lastAt = -Infinity;

  return {
    accept(code, at) {
      if (code === lastCode && at - lastAt < windowMs) {
        return false;
      }
      lastCode = code;
      lastAt = at;
      return true;
    },
    reset() {
      lastCode = null;
      lastAt = -Infinity;
    },
  };
}
