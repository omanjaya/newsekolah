/**
 * A quick journal entry's in-progress text, mirrored to `localStorage` so
 * a teacher filling it in between periods does not lose it to an
 * accidental tab close or a dropped connection -- same rationale as
 * `attendance/lib/attendance-draft.ts`, scoped instead to one class,
 * subject, and lesson date (a journal has no session id of its own) and to
 * the journal it was typed for: a new entry's draft (`journalId` null) is
 * kept apart from the edits to a saved journal of the same lesson, so text
 * typed for a refused duplicate is never offered to that journal's editor,
 * where restoring it would overwrite the saved text.
 *
 * Each draft belongs to the account that typed it (`lib/drafts`): schools
 * share computers, so a draft is stored under its owner and its payload
 * names that owner, and it is never offered to another teacher who opens
 * the same lesson in this browser. Without an owner nothing is stored.
 */
import { readDraft, removeDraft, writeDraft } from "../../../lib/drafts/draft-storage";
import { businessNow } from "../../../lib/simulation/clock";

// Version 3 added `journalId`; an older draft cannot say which journal it
// belongs to, so it reads back as none.
const DRAFT_VERSION = 3;

/** Which lesson, and which of its journals, a draft belongs to. */
export interface JournalDraftScope {
  classId: string;
  subjectId: string;
  lessonDate: string;
  /** The saved journal being edited, or null for a new entry. */
  journalId: string | null;
}

export interface JournalDraft {
  version: number;
  /** Whose draft this is (`lib/drafts/draft-owner.ts`); checked again on every read. */
  owner: string;
  classId: string;
  subjectId: string;
  lessonDate: string;
  journalId: string | null;
  /** ISO timestamp of when the draft was last written, for the restore prompt. */
  savedAt: string;
  topic: string;
  activities: string;
  reflection: string;
}

function recordKey({ classId, subjectId, lessonDate, journalId }: JournalDraftScope): string {
  return `${classId}:${subjectId}:${lessonDate}:${journalId ?? "new"}`;
}

/** No-op (never throws) without an owner or when storage is unavailable: private browsing, quota, or SSR. */
export function saveJournalDraft(
  owner: string | null,
  scope: JournalDraftScope,
  draft: Pick<JournalDraft, "topic" | "activities" | "reflection">,
): void {
  if (!owner) return;
  try {
    const payload: JournalDraft = {
      ...draft,
      version: DRAFT_VERSION,
      owner,
      classId: scope.classId,
      subjectId: scope.subjectId,
      lessonDate: scope.lessonDate,
      journalId: scope.journalId,
      savedAt: businessNow().toISOString(),
    };
    writeDraft(owner, "journal", recordKey(scope), payload);
  } catch {
    // The draft is a convenience, never a requirement.
  }
}

/** Parses and shape-validates the stored draft; a malformed, stale-version or foreign entry reads back as none. */
export function loadJournalDraft(
  owner: string | null,
  scope: JournalDraftScope,
): JournalDraft | null {
  const raw = readDraft(owner, "journal", recordKey(scope));
  if (!raw) return null;
  return parseJournalDraft(owner, raw, scope);
}

/** Pure parse/validate step, split out so it is testable without touching `localStorage`. */
export function parseJournalDraft(
  owner: string | null,
  raw: string,
  scope: JournalDraftScope,
): JournalDraft | null {
  if (!owner) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const draft = parsed as Record<string, unknown>;
  if (
    draft.version !== DRAFT_VERSION ||
    draft.owner !== owner ||
    draft.classId !== scope.classId ||
    draft.subjectId !== scope.subjectId ||
    draft.lessonDate !== scope.lessonDate ||
    draft.journalId !== scope.journalId
  ) {
    return null;
  }
  if (
    typeof draft.savedAt !== "string" ||
    typeof draft.topic !== "string" ||
    typeof draft.activities !== "string" ||
    typeof draft.reflection !== "string"
  ) {
    return null;
  }
  return draft as unknown as JournalDraft;
}

export function clearJournalDraft(owner: string | null, scope: JournalDraftScope): void {
  removeDraft(owner, "journal", recordKey(scope));
}
