/**
 * A quick journal entry's in-progress text, mirrored to `localStorage` so
 * a teacher filling it in between periods does not lose it to an
 * accidental tab close or a dropped connection -- same rationale as
 * `attendance/lib/attendance-draft.ts`, scoped instead to one class,
 * subject, and lesson date (a journal has no session id of its own).
 *
 * Each draft belongs to the account that typed it (`lib/drafts`): schools
 * share computers, so a draft is stored under its owner and its payload
 * names that owner, and it is never offered to another teacher who opens
 * the same lesson in this browser. Without an owner nothing is stored.
 */
import { readDraft, removeDraft, writeDraft } from "../../../lib/drafts/draft-storage";
import { businessNow } from "../../../lib/simulation/clock";

const DRAFT_VERSION = 2;

export interface JournalDraft {
  version: number;
  /** Whose draft this is (`lib/drafts/draft-owner.ts`); checked again on every read. */
  owner: string;
  classId: string;
  subjectId: string;
  lessonDate: string;
  /** ISO timestamp of when the draft was last written, for the restore prompt. */
  savedAt: string;
  topic: string;
  activities: string;
  reflection: string;
}

function recordKey(classId: string, subjectId: string, lessonDate: string): string {
  return `${classId}:${subjectId}:${lessonDate}`;
}

/** No-op (never throws) without an owner or when storage is unavailable: private browsing, quota, or SSR. */
export function saveJournalDraft(
  owner: string | null,
  classId: string,
  subjectId: string,
  lessonDate: string,
  draft: Pick<JournalDraft, "topic" | "activities" | "reflection">,
): void {
  if (!owner) return;
  try {
    const payload: JournalDraft = {
      ...draft,
      version: DRAFT_VERSION,
      owner,
      classId,
      subjectId,
      lessonDate,
      savedAt: businessNow().toISOString(),
    };
    writeDraft(owner, "journal", recordKey(classId, subjectId, lessonDate), payload);
  } catch {
    // The draft is a convenience, never a requirement.
  }
}

/** Parses and shape-validates the stored draft; a malformed, stale-version or foreign entry reads back as none. */
export function loadJournalDraft(
  owner: string | null,
  classId: string,
  subjectId: string,
  lessonDate: string,
): JournalDraft | null {
  const raw = readDraft(owner, "journal", recordKey(classId, subjectId, lessonDate));
  if (!raw) return null;
  return parseJournalDraft(owner, raw, classId, subjectId, lessonDate);
}

/** Pure parse/validate step, split out so it is testable without touching `localStorage`. */
export function parseJournalDraft(
  owner: string | null,
  raw: string,
  classId: string,
  subjectId: string,
  lessonDate: string,
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
    draft.classId !== classId ||
    draft.subjectId !== subjectId ||
    draft.lessonDate !== lessonDate
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

export function clearJournalDraft(
  owner: string | null,
  classId: string,
  subjectId: string,
  lessonDate: string,
): void {
  removeDraft(owner, "journal", recordKey(classId, subjectId, lessonDate));
}
