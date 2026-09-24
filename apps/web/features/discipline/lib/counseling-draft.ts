/**
 * A counseling note's in-progress long-form fields, mirrored to
 * `localStorage` so an accidental tab close or a dropped connection mid-
 * write does not lose a counselor's notes (docs/07-ui-ux.md's "simpan draf
 * otomatis untuk form panjang"). Scoped to one `draftId` -- the counseling
 * record's id when editing, or the fixed string `"new"` for a session not
 * yet created -- and versioned so a shape change never hands old,
 * half-matching data back to a newer editor. Mirrors the pattern in
 * `attendance/lib/attendance-draft.ts`.
 */
const DRAFT_VERSION = 1;
const KEY_PREFIX = "newsekolah:counseling-draft:";

export interface CounselingDraft {
  version: number;
  draftId: string;
  /** ISO timestamp of when the draft was last written, for the restore prompt. */
  savedAt: string;
  title: string;
  content: string;
  followUpPlan: string;
  careerGoals: string;
  problemDescription: string;
}

function storageKey(draftId: string): string {
  return `${KEY_PREFIX}${draftId}`;
}

/** No-op (never throws) when storage is unavailable: private browsing, quota, or SSR. */
export function saveCounselingDraft(
  draftId: string,
  draft: Omit<CounselingDraft, "version" | "draftId" | "savedAt">,
): void {
  try {
    const payload: CounselingDraft = {
      ...draft,
      version: DRAFT_VERSION,
      draftId,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(storageKey(draftId), JSON.stringify(payload));
  } catch {
    // The draft is a convenience, never a requirement: a write failure
    // (storage disabled, quota exceeded) is silently ignored.
  }
}

/** Parses and shape-validates the stored draft; a malformed or stale-version entry reads back as none. */
export function loadCounselingDraft(draftId: string): CounselingDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(draftId));
    if (!raw) return null;
    return parseCounselingDraft(raw, draftId);
  } catch {
    return null;
  }
}

/** Pure parse/validate step, split out from `loadCounselingDraft` so it is testable without touching `localStorage`. */
export function parseCounselingDraft(raw: string, draftId: string): CounselingDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const draft = parsed as Record<string, unknown>;
  if (draft.version !== DRAFT_VERSION || draft.draftId !== draftId) return null;
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

export function clearCounselingDraft(draftId: string): void {
  try {
    window.localStorage.removeItem(storageKey(draftId));
  } catch {
    // See saveCounselingDraft: best-effort only.
  }
}
