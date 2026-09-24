/**
 * An in-progress observation's scores and notes, mirrored to `localStorage`
 * while a supervisor fills the instrument live during a lesson -- often on
 * a tablet or phone, on a classroom's own flaky Wi-Fi. Scoped to one
 * `scheduledId` and versioned so a shape change never hands old,
 * half-matching data back to a newer form. Mirrors
 * `features/attendance/lib/attendance-draft.ts`'s shape and guarantees
 * (never throws, cleared on a successful save).
 */
const DRAFT_VERSION = 1;
const KEY_PREFIX = "newsekolah:supervision-observation-draft:";

export interface ObservationDraft {
  version: number;
  scheduledId: string;
  /** ISO timestamp of when the draft was last written, for the restore prompt. */
  savedAt: string;
  scores: Record<string, string>;
  observerNotes: string;
  observedAt: string;
}

function storageKey(scheduledId: string): string {
  return `${KEY_PREFIX}${scheduledId}`;
}

/** No-op (never throws) when storage is unavailable: private browsing, quota, or SSR. */
export function saveObservationDraft(
  scheduledId: string,
  draft: Omit<ObservationDraft, "version" | "scheduledId" | "savedAt">,
): void {
  try {
    const payload: ObservationDraft = {
      ...draft,
      version: DRAFT_VERSION,
      scheduledId,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(storageKey(scheduledId), JSON.stringify(payload));
  } catch {
    // The draft is a convenience, never a requirement: a write failure
    // (storage disabled, quota exceeded) is silently ignored rather than
    // surfaced to an observer mid-lesson.
  }
}

/** Parses and shape-validates the stored draft; a malformed or stale-version entry reads back as none. */
export function loadObservationDraft(scheduledId: string): ObservationDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(scheduledId));
    if (!raw) return null;
    return parseObservationDraft(raw, scheduledId);
  } catch {
    return null;
  }
}

/** Pure parse/validate step, split out from `loadObservationDraft` so it is testable without touching `localStorage`. */
export function parseObservationDraft(raw: string, scheduledId: string): ObservationDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  // Read through `Record<string, unknown>` rather than casting straight to
  // `ObservationDraft`: this data came from `localStorage`, so nothing
  // about its shape is guaranteed, and a typed cast would make TypeScript
  // treat these checks as already-proven instead of the runtime
  // validation they actually are.
  const draft = parsed as Record<string, unknown>;
  if (draft.version !== DRAFT_VERSION || draft.scheduledId !== scheduledId) return null;
  if (
    typeof draft.savedAt !== "string" ||
    typeof draft.scores !== "object" ||
    draft.scores === null ||
    typeof draft.observerNotes !== "string" ||
    typeof draft.observedAt !== "string"
  ) {
    return null;
  }
  return draft as unknown as ObservationDraft;
}

export function clearObservationDraft(scheduledId: string): void {
  try {
    window.localStorage.removeItem(storageKey(scheduledId));
  } catch {
    // See saveObservationDraft: best-effort only.
  }
}
