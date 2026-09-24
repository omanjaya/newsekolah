/**
 * A session's in-progress edits, mirrored to `localStorage` so a dropped
 * classroom connection or an accidental reload does not throw away a
 * teacher's roster before it reaches the server (docs/07-ui-ux.md's
 * "simpan bekerja offline"). Scoped to one `sessionId` and versioned so a
 * shape change never hands old, half-matching data back to a newer editor.
 *
 * This is a deliberate exception to the plain "do not persist entries to
 * storage" rule `use-unsaved-changes-protection.ts` states for the general
 * navigation guard: that guard protects against losing work to a
 * *navigation*, this protects against losing it to a *reload or crash*
 * mid-lesson, which is the specific failure mode observed in classrooms on
 * flaky Wi-Fi. The draft is cleared the moment a save succeeds (see
 * `session-view.tsx`) or the teacher declines to restore it, so it never
 * outlives the session it was written for.
 */
const DRAFT_VERSION = 1;
const KEY_PREFIX = "newsekolah:attendance-draft:";

export interface AttendanceDraft {
  version: number;
  sessionId: string;
  /** ISO timestamp of when the draft was last written, for the restore prompt. */
  savedAt: string;
  statuses: Record<string, string>;
  notes: Record<string, string>;
  violations: Record<string, string[]>;
  topic: string;
  activities: string;
  reflection: string;
}

function storageKey(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

/** No-op (never throws) when storage is unavailable: private browsing, quota, or SSR. */
export function saveAttendanceDraft(
  sessionId: string,
  draft: Omit<AttendanceDraft, "version" | "sessionId" | "savedAt">,
): void {
  try {
    const payload: AttendanceDraft = {
      ...draft,
      version: DRAFT_VERSION,
      sessionId,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(storageKey(sessionId), JSON.stringify(payload));
  } catch {
    // The draft is a convenience, never a requirement: a write failure
    // (storage disabled, quota exceeded) is silently ignored rather than
    // surfaced to a teacher mid-lesson.
  }
}

/** Parses and shape-validates the stored draft; a malformed or stale-version entry reads back as none. */
export function loadAttendanceDraft(sessionId: string): AttendanceDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId));
    if (!raw) return null;
    return parseAttendanceDraft(raw, sessionId);
  } catch {
    return null;
  }
}

/** Pure parse/validate step, split out from `loadAttendanceDraft` so it is testable without touching `localStorage`. */
export function parseAttendanceDraft(raw: string, sessionId: string): AttendanceDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  // Read through `Record<string, unknown>` rather than casting straight to
  // `Partial<AttendanceDraft>`: this data came from `localStorage`, so
  // nothing about its shape is guaranteed, and a typed cast would make
  // TypeScript treat these checks as already-proven instead of the
  // runtime validation they actually are.
  const draft = parsed as Record<string, unknown>;
  if (draft.version !== DRAFT_VERSION || draft.sessionId !== sessionId) return null;
  if (
    typeof draft.savedAt !== "string" ||
    typeof draft.statuses !== "object" ||
    draft.statuses === null ||
    typeof draft.notes !== "object" ||
    draft.notes === null ||
    typeof draft.violations !== "object" ||
    draft.violations === null ||
    typeof draft.topic !== "string" ||
    typeof draft.activities !== "string" ||
    typeof draft.reflection !== "string"
  ) {
    return null;
  }
  return draft as unknown as AttendanceDraft;
}

export function clearAttendanceDraft(sessionId: string): void {
  try {
    window.localStorage.removeItem(storageKey(sessionId));
  } catch {
    // See saveAttendanceDraft: best-effort only.
  }
}
