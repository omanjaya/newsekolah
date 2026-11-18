import { useState } from "react";

import { useSession, type Me } from "../session/session-provider";

/** The parts of `Me` that decide whose a draft is. */
export type DraftOwnerSource = Pick<Me, "id" | "impersonated_by"> & {
  tenant: Pick<Me["tenant"], "tenant_id">;
};

/**
 * Whose drafts the signed-in session reads and writes: `<tenantId>:<userId>`,
 * or `<tenantId>:<userId>~<actorId>` while an administrator acts as this
 * user. The acting administrator is part of it so that what they type as a
 * teacher is offered neither to the real teacher later nor to their own
 * account. Null when there is no session yet, or when an administrator is
 * acting but the session does not say who: with no owner nothing is stored.
 */
export function draftOwnerOf(me: DraftOwnerSource | undefined): string | null {
  if (!me?.id || !me.tenant.tenant_id) return null;
  const base = `${me.tenant.tenant_id}:${me.id}`;
  if (!me.impersonated_by) return base;
  const actorId = me.impersonated_by.user_id;
  return actorId ? `${base}~${actorId}` : null;
}

/**
 * The draft owner for one form, pinned to the first account the form saw.
 * If the signed-in account changes while the form stays open (another tab
 * signed in someone else, so the session refetch now returns them), this
 * turns null for the rest of the form's life: the edits in memory were
 * typed by the first account and must never be stored or offered under the
 * second. It never deletes anything; that is left to an explicit sign-out.
 */
export function useDraftOwner(): string | null {
  const { me } = useSession();
  const current = draftOwnerOf(me);
  const [pinned, setPinned] = useState(current);
  // Adjusted during render rather than in an effect, so the first render
  // with a known owner already uses it (React's pattern for state derived
  // from a changing value).
  if (pinned === null && current !== null) setPinned(current);
  const owner = pinned ?? current;
  return owner !== null && owner === current ? owner : null;
}
