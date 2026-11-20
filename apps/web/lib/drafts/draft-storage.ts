/**
 * The one place form drafts touch `localStorage`.
 *
 * Schools share computers, and a draft can hold a description of a
 * student's problem, so every draft belongs to one owner (see
 * `draft-owner.ts`) and the owner is part of its key:
 * `newsekolah:draft:<owner>:<kind>:<record>`. A draft is never read for
 * anyone else, and with no owner (the session not loaded yet, or nobody
 * signed in) nothing is read or written at all.
 *
 * Drafts deliberately survive a reload, a crash, a closed tab and an
 * expired session: keeping a teacher's work through a dropped classroom
 * connection is their whole purpose. Only an explicit sign-out removes
 * them (`removeAllDrafts`, via `lib/session/forget-account.ts`), and an
 * impersonation that hands the browser back to its administrator removes
 * the impersonated session's own (`removeDraftsOf`).
 *
 * Every function here swallows storage failures (private browsing, a full
 * quota, storage disabled, server rendering): a draft is a convenience and
 * must never break the form it belongs to.
 */

export type DraftKind = "attendance" | "counseling" | "journal" | "gradebook" | "observation";

/** Every owned draft's key starts with this, which is how sign-out finds them all. */
export const DRAFT_KEY_PREFIX = "newsekolah:draft:";

/**
 * Where drafts lived before they had owners. Nothing in them says who wrote
 * them, so they can never be offered safely and are only ever deleted.
 */
const LEGACY_DRAFT_KEY_PREFIXES = [
  "newsekolah:attendance-draft:",
  "newsekolah:counseling-draft:",
  "newsekolah:journal-draft:",
  "newsekolah:gradebook-draft:",
  "newsekolah:supervision-observation-draft:",
];

export function draftKey(owner: string, kind: DraftKind, record: string): string {
  return `${DRAFT_KEY_PREFIX}${owner}:${kind}:${record}`;
}

/**
 * The stored text for this owner's draft, or null. Returned unparsed so
 * each draft module validates the shape (and the owner inside it) itself.
 */
export function readDraft(owner: string | null, kind: DraftKind, record: string): string | null {
  if (!owner) return null;
  try {
    return window.localStorage.getItem(draftKey(owner, kind, record));
  } catch {
    return null;
  }
}

/** Stores the payload as JSON; does nothing without an owner. */
export function writeDraft(
  owner: string | null,
  kind: DraftKind,
  record: string,
  payload: unknown,
): void {
  if (!owner) return;
  try {
    window.localStorage.setItem(draftKey(owner, kind, record), JSON.stringify(payload));
  } catch {
    // A failed write only loses the safety net, never the form itself.
  }
}

export function removeDraft(owner: string | null, kind: DraftKind, record: string): void {
  if (!owner) return;
  try {
    window.localStorage.removeItem(draftKey(owner, kind, record));
  } catch {
    // Best effort, like every other function here.
  }
}

/**
 * Removes every key the predicate accepts. The keys are collected first:
 * removing while indexing shifts the remaining keys down and skips some.
 */
function removeKeysWhere(matches: (key: string) => boolean): void {
  const doomed: string[] = [];
  try {
    const storage = window.localStorage;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null && matches(key)) doomed.push(key);
    }
  } catch {
    return;
  }
  for (const key of doomed) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Keep going: one failed removal must not leave the others behind.
    }
  }
}

/** Every owner's drafts of every kind: what an explicit sign-out leaves behind. */
export function removeAllDrafts(): void {
  removeKeysWhere((key) => key.startsWith(DRAFT_KEY_PREFIX));
}

/**
 * One owner's drafts of every kind, and nobody else's: what an
 * impersonation leaves behind once the administrator is back in their own
 * session on this browser. Does nothing without an owner.
 */
export function removeDraftsOf(owner: string | null): void {
  if (!owner) return;
  const prefix = `${DRAFT_KEY_PREFIX}${owner}:`;
  removeKeysWhere((key) => key.startsWith(prefix));
}

/** Deletes drafts stored before they had owners; run once when the app starts. */
export function discardLegacyDrafts(): void {
  removeKeysWhere((key) => LEGACY_DRAFT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)));
}
