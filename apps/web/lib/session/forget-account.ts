import { removeAllDrafts, removeDraftsOf } from "../drafts/draft-storage";
import { clearUserLocaleCookie } from "../i18n/user-locale-cookie";
import { deleteAccountScopedCaches } from "../pwa/cache-policy";

/**
 * Removes what this browser keeps on behalf of whoever used it, for an
 * explicit sign-out (the account menu, the forced password change screen,
 * stopping an impersonation that leaves nobody signed in). Schools share
 * computers, and the next person at this one must find none of it.
 *
 * Every owner's drafts go, not only the signing-out account's: a draft left
 * by someone who walked away without signing out is no safer for being
 * someone else's. Called before the sign-out request is sent, and the draft
 * removal is synchronous, so it neither waits on nor depends on the network
 * (a sign-out that fails on the network still clears the token). The cache
 * deletion is asynchronous and never throws; it is started, not awaited.
 *
 * An expired session, a closed tab or a reload is not a sign-out: drafts
 * survive those on purpose (see `lib/drafts/draft-storage.ts`).
 */
export function forgetAccountOnThisBrowser(): void {
  removeAllDrafts();
  // The next person here sees the school's language, not this account's.
  clearUserLocaleCookie();
  void deleteAccountScopedCaches();
}

/**
 * Removes what an impersonation left on this browser once the server has
 * handed it back to the administrator's own session: the drafts typed as
 * the impersonated account (`owner`, from `draftOwnerOf`) and the account
 * caches holding what it read. Not a sign-out: the administrator stays
 * signed in here, so their own drafts and language stay too.
 */
export function forgetImpersonationOnThisBrowser(owner: string | null): void {
  removeDraftsOf(owner);
  void deleteAccountScopedCaches();
}
