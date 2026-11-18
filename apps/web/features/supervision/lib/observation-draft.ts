/**
 * An in-progress observation's scores and notes, mirrored to `localStorage`
 * while a supervisor fills the instrument live during a lesson -- often on
 * a tablet or phone, on a classroom's own flaky Wi-Fi. Scoped to one
 * `scheduledId` and versioned so a shape change never hands old,
 * half-matching data back to a newer form. Mirrors
 * `features/attendance/lib/attendance-draft.ts`'s shape and guarantees
 * (never throws, cleared on a successful save).
 *
 * Each draft belongs to the account that typed it (`lib/drafts`): an
 * observation draft is an assessment of a named teacher and schools share
 * devices, so the draft is stored under its owner, its payload names that
 * owner, and it is never offered to anyone else who opens the same
 * observation in this browser. Without an owner nothing is stored.
 */
import { readDraft, removeDraft, writeDraft } from "../../../lib/drafts/draft-storage";
import { businessNow } from "../../../lib/simulation/clock";

const DRAFT_VERSION = 2;

export interface ObservationDraft {
  version: number;
  /** Whose draft this is (`lib/drafts/draft-owner.ts`); checked again on every read. */
  owner: string;
  scheduledId: string;
  /** ISO timestamp of when the draft was last written, for the restore prompt. */
  savedAt: string;
  scores: Record<string, string>;
  observerNotes: string;
  observedAt: string;
}

/** No-op (never throws) without an owner or when storage is unavailable: private browsing, quota, or SSR. */
export function saveObservationDraft(
  owner: string | null,
  scheduledId: string,
  draft: Omit<ObservationDraft, "version" | "owner" | "scheduledId" | "savedAt">,
): void {
  if (!owner) return;
  try {
    const payload: ObservationDraft = {
      ...draft,
      version: DRAFT_VERSION,
      owner,
      scheduledId,
      savedAt: businessNow().toISOString(),
    };
    writeDraft(owner, "observation", scheduledId, payload);
  } catch {
    // The draft is a convenience, never a requirement: a failure is
    // silently ignored rather than surfaced to an observer mid-lesson.
  }
}

/** Parses and shape-validates the stored draft; a malformed, stale-version or foreign entry reads back as none. */
export function loadObservationDraft(
  owner: string | null,
  scheduledId: string,
): ObservationDraft | null {
  const raw = readDraft(owner, "observation", scheduledId);
  if (!raw) return null;
  return parseObservationDraft(owner, raw, scheduledId);
}

/** Pure parse/validate step, split out from `loadObservationDraft` so it is testable without touching `localStorage`. */
export function parseObservationDraft(
  owner: string | null,
  raw: string,
  scheduledId: string,
): ObservationDraft | null {
  if (!owner) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  // Read through `Record<string, unknown>` rather than casting straight to
  // `ObservationDraft`: this data came from `localStorage`, so nothing
  // about its shape is guaranteed, and a typed cast would make TypeScript
  // treat these checks as already-proven instead of the runtime
  // validation they actually are.
  const draft = parsed as Record<string, unknown>;
  if (
    draft.version !== DRAFT_VERSION ||
    draft.owner !== owner ||
    draft.scheduledId !== scheduledId
  ) {
    return null;
  }
  if (
    typeof draft.savedAt !== "string" ||
    typeof draft.scores !== "object" ||
    draft.scores === null ||
    typeof draft.observerNotes !== "string" ||
    typeof draft.observedAt !== "string"
  ) {
    return null;
  }
  return draft as unknown as ObservationDraft;
}

export function clearObservationDraft(owner: string | null, scheduledId: string): void {
  removeDraft(owner, "observation", scheduledId);
}
