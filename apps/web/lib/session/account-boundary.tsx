"use client";

import { useEffect } from "react";

import { draftOwnerOf } from "../drafts/draft-owner";
import { discardLegacyDrafts } from "../drafts/draft-storage";
import { deleteAccountScopedCaches } from "../pwa/cache-policy";

import { useSession } from "./session-provider";

/**
 * Housekeeping at the edge between accounts on a shared browser. Renders
 * nothing; mounted once inside `SessionProvider`.
 *
 * - On start: deletes drafts stored before drafts had owners, which cannot
 *   be attributed to anyone and so can never be offered.
 * - Once the session settles, and again whenever the signed-in account
 *   changes: deletes every Cache Storage cache that is not identical for
 *   all accounts. The current service worker no longer writes any, but an
 *   older one can still control an open tab until it is replaced. Deleting
 *   a cache never loses work, so it is safe to drive from the observed
 *   session even while that is momentarily stale.
 *
 * It never deletes drafts of the new format: the observed session can lag
 * behind an identity change, and only an explicit sign-out
 * (`forget-account.ts`) may take someone's unsaved work away.
 */
export function AccountBoundary(): null {
  const { me, isReady } = useSession();
  const owner = draftOwnerOf(me);

  useEffect(() => {
    discardLegacyDrafts();
  }, []);

  // `owner` is listed only so the effect runs again for a different account.
  useEffect(() => {
    if (!isReady) return;
    void deleteAccountScopedCaches();
  }, [isReady, owner]);

  return null;
}
