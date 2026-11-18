/**
 * A counseling note's in-progress long-form fields, mirrored to
 * `localStorage` so an accidental tab close or a dropped connection mid-
 * write does not lose a counselor's notes (docs/07-ui-ux.md's "simpan draf
 * otomatis untuk form panjang"). Scoped to one `draftId` -- the counseling
 * record's id when editing, or `"new"` (`"new:<studentId>"` when opened for
 * a student) for a session not yet created -- and versioned so a shape
 * change never hands old, half-matching data back to a newer editor.
 * Mirrors the pattern in `attendance/lib/attendance-draft.ts`.
 *
 * Each draft belongs to the account that typed it (`lib/drafts`). This one
 * matters most: a counseling draft can describe a student's problem, and
 * schools share computers, so the draft is stored under its owner, its
 * payload names that owner, and it is never offered to anyone else who
 * opens a new note in this browser. Without an owner nothing is stored.
 */
import { readDraft, removeDraft, writeDraft } from "../../../lib/drafts/draft-storage";
import { businessNow } from "../../../lib/simulation/clock";

const DRAFT_VERSION = 2;

export interface CounselingDraft {
  version: number;
  /** Whose draft this is (`lib/drafts/draft-owner.ts`); checked again on every read. */
  owner: string;
  draftId: string;
  /** ISO timestamp of when the draft was last written, for the restore prompt. */
  savedAt: string;
  title: string;
  content: string;
  followUpPlan: string;
  careerGoals: string;
  problemDescription: string;
}

/** No-op (never throws) without an owner or when storage is unavailable: private browsing, quota, or SSR. */
export function saveCounselingDraft(
  owner: string | null,
  draftId: string,
  draft: Omit<CounselingDraft, "version" | "owner" | "draftId" | "savedAt">,
): void {
  if (!owner) return;
  try {
    const payload: CounselingDraft = {
      ...draft,
      version: DRAFT_VERSION,
      owner,
      draftId,
      savedAt: businessNow().toISOString(),
    };
    writeDraft(owner, "counseling", draftId, payload);
  } catch {
    // The draft is a convenience, never a requirement: a failure is
    // silently ignored.
  }
}

/** Parses and shape-validates the stored draft; a malformed, stale-version or foreign entry reads back as none. */
export function loadCounselingDraft(owner: string | null, draftId: string): CounselingDraft | null {
  const raw = readDraft(owner, "counseling", draftId);
  if (!raw) return null;
  return parseCounselingDraft(owner, raw, draftId);
}

/** Pure parse/validate step, split out from `loadCounselingDraft` so it is testable without touching `localStorage`. */
export function parseCounselingDraft(
  owner: string | null,
  raw: string,
  draftId: string,
): CounselingDraft | null {
  if (!owner) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const draft = parsed as Record<string, unknown>;
  if (draft.version !== DRAFT_VERSION || draft.owner !== owner || draft.draftId !== draftId) {
    return null;
  }
  if (
    typeof draft.savedAt !== "string" ||
    typeof draft.title !== "string" ||
    typeof draft.content !== "string" ||
    typeof draft.followUpPlan !== "string" ||
    typeof draft.careerGoals !== "string" ||
    typeof draft.problemDescription !== "string"
  ) {
    return null;
  }
  return draft as unknown as CounselingDraft;
}

export function clearCounselingDraft(owner: string | null, draftId: string): void {
  removeDraft(owner, "counseling", draftId);
}
