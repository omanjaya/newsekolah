/**
 * A session's in-progress edits, mirrored to `localStorage` so a dropped
 * classroom connection or an accidental reload does not throw away a
 * teacher's roster before it reaches the server (docs/07-ui-ux.md's
 * "simpan bekerja offline"). Scoped to one `sessionId` and versioned so a
 * shape change never hands old, half-matching data back to a newer editor.
 *
 * Each draft belongs to the account that typed it (`lib/drafts`): schools
 * share computers, so a draft is stored under its owner and its payload
 * names that owner, and it is never offered to anyone else who opens the
 * same session in this browser. Without an owner nothing is stored.
 *
 * This is a deliberate exception to the plain "do not persist entries to
 * storage" rule `use-unsaved-changes-protection.ts` states for the general
 * navigation guard: that guard protects against losing work to a
 * *navigation*, this protects against losing it to a *reload or crash*
 * mid-lesson, which is the specific failure mode observed in classrooms on
 * flaky Wi-Fi. The draft is cleared the moment a save succeeds (see
 * `session-editor.tsx`), when the teacher declines to restore it, or when
 * someone signs out of this browser.
 */
import { readDraft, removeDraft, writeDraft } from "../../../lib/drafts/draft-storage";
import { businessNow } from "../../../lib/simulation/clock";

const DRAFT_VERSION = 2;

export interface AttendanceDraft {
  version: number;
  /** Whose draft this is (`lib/drafts/draft-owner.ts`); checked again on every read. */
  owner: string;
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

/** No-op (never throws) without an owner or when storage is unavailable: private browsing, quota, or SSR. */
export function saveAttendanceDraft(
  owner: string | null,
  sessionId: string,
  draft: Omit<AttendanceDraft, "version" | "owner" | "sessionId" | "savedAt">,
): void {
  if (!owner) return;
  try {
    const payload: AttendanceDraft = {
      ...draft,
      version: DRAFT_VERSION,
      owner,
      sessionId,
      savedAt: businessNow().toISOString(),
    };
    writeDraft(owner, "attendance", sessionId, payload);
  } catch {
    // The draft is a convenience, never a requirement: a failure is
    // silently ignored rather than surfaced to a teacher mid-lesson.
  }
}

/** Parses and shape-validates the stored draft; a malformed, stale-version or foreign entry reads back as none. */
export function loadAttendanceDraft(
  owner: string | null,
  sessionId: string,
): AttendanceDraft | null {
  const raw = readDraft(owner, "attendance", sessionId);
  if (!raw) return null;
  return parseAttendanceDraft(owner, raw, sessionId);
}

/** Pure parse/validate step, split out from `loadAttendanceDraft` so it is testable without touching `localStorage`. */
export function parseAttendanceDraft(
  owner: string | null,
  raw: string,
  sessionId: string,
): AttendanceDraft | null {
  if (!owner) return null;
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
  if (draft.version !== DRAFT_VERSION || draft.owner !== owner || draft.sessionId !== sessionId) {
    return null;
  }
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

export function clearAttendanceDraft(owner: string | null, sessionId: string): void {
  removeDraft(owner, "attendance", sessionId);
}
