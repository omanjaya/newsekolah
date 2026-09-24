/**
 * A quick journal entry's in-progress text, mirrored to `localStorage` so
 * a teacher filling it in between periods does not lose it to an
 * accidental tab close or a dropped connection -- same rationale as
 * `attendance/lib/attendance-draft.ts`, scoped instead to one class,
 * subject, and lesson date (a journal has no session id of its own).
 */
const DRAFT_VERSION = 1;
const KEY_PREFIX = "newsekolah:journal-draft:";

export interface JournalDraft {
  version: number;
  classId: string;
  subjectId: string;
  lessonDate: string;
  /** ISO timestamp of when the draft was last written, for the restore prompt. */
  savedAt: string;
  topic: string;
  activities: string;
  reflection: string;
}

function storageKey(classId: string, subjectId: string, lessonDate: string): string {
  return `${KEY_PREFIX}${classId}:${subjectId}:${lessonDate}`;
}

/** No-op (never throws) when storage is unavailable: private browsing, quota, or SSR. */
export function saveJournalDraft(
  classId: string,
  subjectId: string,
  lessonDate: string,
  draft: Pick<JournalDraft, "topic" | "activities" | "reflection">,
): void {
  try {
    const payload: JournalDraft = {
      ...draft,
      version: DRAFT_VERSION,
      classId,
      subjectId,
      lessonDate,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(
      storageKey(classId, subjectId, lessonDate),
      JSON.stringify(payload),
    );
  } catch {
    // The draft is a convenience, never a requirement.
  }
}

/** Parses and shape-validates the stored draft; a malformed or stale-version entry reads back as none. */
export function loadJournalDraft(
  classId: string,
  subjectId: string,
  lessonDate: string,
): JournalDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(classId, subjectId, lessonDate));
    if (!raw) return null;
    return parseJournalDraft(raw, classId, subjectId, lessonDate);
  } catch {
    return null;
  }
}

/** Pure parse/validate step, split out so it is testable without touching `localStorage`. */
export function parseJournalDraft(
  raw: string,
  classId: string,
  subjectId: string,
  lessonDate: string,
): JournalDraft | null {
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

export function clearJournalDraft(classId: string, subjectId: string, lessonDate: string): void {
  try {
    window.localStorage.removeItem(storageKey(classId, subjectId, lessonDate));
  } catch {
    // See saveJournalDraft: best-effort only.
  }
}
