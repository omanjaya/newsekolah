import { readDraft, removeDraft, writeDraft } from "../../../lib/drafts/draft-storage";
import { businessNow } from "../../../lib/simulation/clock";
import type { Edits } from "../components/gradebook-types";

/**
 * A gradebook sheet's in-progress score edits, mirrored to `localStorage`
 * so a dropped connection or an accidental reload does not throw away a
 * teacher's half-filled column before it reaches the server -- the same
 * draft convention `attendance/lib/attendance-draft.ts` established for
 * the roster (see its own comment for the offline-classroom rationale).
 * Scoped to one class-subject-term sheet and versioned so a shape change
 * never hands old, half-matching data back to a newer editor.
 *
 * Each draft belongs to the account that typed it (`lib/drafts`): schools
 * share computers, so a draft is stored under its owner and its payload
 * names that owner, and it is never offered to another teacher who opens
 * the same sheet in this browser. Without an owner nothing is stored.
 */
const DRAFT_VERSION = 2;

export interface GradebookDraft {
  version: number;
  /** Whose draft this is (`lib/drafts/draft-owner.ts`); checked again on every read. */
  owner: string;
  sheetKey: string;
  /** ISO timestamp of when the draft was last written, for the restore prompt. */
  savedAt: string;
  edits: Edits;
}

/** No-op (never throws) without an owner or when storage is unavailable: private browsing, quota, or SSR. */
export function saveGradebookDraft(owner: string | null, sheetKey: string, edits: Edits): void {
  if (!owner) return;
  try {
    const payload: GradebookDraft = {
      version: DRAFT_VERSION,
      owner,
      sheetKey,
      savedAt: businessNow().toISOString(),
      edits,
    };
    writeDraft(owner, "gradebook", sheetKey, payload);
  } catch {
    // The draft is a convenience, never a requirement: a failure is
    // silently ignored rather than surfaced to a teacher mid-lesson.
  }
}

/** Parses and shape-validates the stored draft; a malformed, stale-version or foreign entry reads back as none. */
export function loadGradebookDraft(owner: string | null, sheetKey: string): GradebookDraft | null {
  const raw = readDraft(owner, "gradebook", sheetKey);
  if (!raw) return null;
  return parseGradebookDraft(owner, raw, sheetKey);
}

/** Pure parse/validate step, split out from `loadGradebookDraft` so it is testable without touching `localStorage`. */
export function parseGradebookDraft(
  owner: string | null,
  raw: string,
  sheetKey: string,
): GradebookDraft | null {
  if (!owner) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const draft = parsed as Record<string, unknown>;
  if (draft.version !== DRAFT_VERSION || draft.owner !== owner || draft.sheetKey !== sheetKey) {
    return null;
  }
  if (
    typeof draft.savedAt !== "string" ||
    typeof draft.edits !== "object" ||
    draft.edits === null
  ) {
    return null;
  }
  return draft as unknown as GradebookDraft;
}

export function clearGradebookDraft(owner: string | null, sheetKey: string): void {
  removeDraft(owner, "gradebook", sheetKey);
}
