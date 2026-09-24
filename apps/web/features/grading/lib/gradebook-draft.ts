import type { Edits } from "../components/gradebook-types";

/**
 * A gradebook sheet's in-progress score edits, mirrored to `localStorage`
 * so a dropped connection or an accidental reload does not throw away a
 * teacher's half-filled column before it reaches the server -- the same
 * draft convention `attendance/lib/attendance-draft.ts` established for
 * the roster (see its own comment for the offline-classroom rationale).
 * Scoped to one class-subject-term sheet and versioned so a shape change
 * never hands old, half-matching data back to a newer editor.
 */
const DRAFT_VERSION = 1;
const KEY_PREFIX = "newsekolah:gradebook-draft:";

export interface GradebookDraft {
  version: number;
  sheetKey: string;
  /** ISO timestamp of when the draft was last written, for the restore prompt. */
  savedAt: string;
  edits: Edits;
}

function storageKey(sheetKey: string): string {
  return `${KEY_PREFIX}${sheetKey}`;
}

/** No-op (never throws) when storage is unavailable: private browsing, quota, or SSR. */
export function saveGradebookDraft(sheetKey: string, edits: Edits): void {
  try {
    const payload: GradebookDraft = {
      version: DRAFT_VERSION,
      sheetKey,
      savedAt: new Date().toISOString(),
      edits,
    };
    window.localStorage.setItem(storageKey(sheetKey), JSON.stringify(payload));
  } catch {
    // The draft is a convenience, never a requirement: a write failure
    // (storage disabled, quota exceeded) is silently ignored rather than
    // surfaced to a teacher mid-lesson.
  }
}

/** Parses and shape-validates the stored draft; a malformed or stale-version entry reads back as none. */
export function loadGradebookDraft(sheetKey: string): GradebookDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(sheetKey));
    if (!raw) return null;
    return parseGradebookDraft(raw, sheetKey);
  } catch {
    return null;
  }
}

/** Pure parse/validate step, split out from `loadGradebookDraft` so it is testable without touching `localStorage`. */
export function parseGradebookDraft(raw: string, sheetKey: string): GradebookDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const draft = parsed as Record<string, unknown>;
  if (draft.version !== DRAFT_VERSION || draft.sheetKey !== sheetKey) return null;
  if (
    typeof draft.savedAt !== "string" ||
    typeof draft.edits !== "object" ||
    draft.edits === null
  ) {
    return null;
  }
  return draft as unknown as GradebookDraft;
}

export function clearGradebookDraft(sheetKey: string): void {
  try {
    window.localStorage.removeItem(storageKey(sheetKey));
  } catch {
    // See saveGradebookDraft: best-effort only.
  }
}
