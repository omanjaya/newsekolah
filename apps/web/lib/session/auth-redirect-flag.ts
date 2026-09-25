/**
 * A page that loses its session mid-visit (`ApiClientProvider`'s
 * `onUnauthorized`, wired to `AppProviders.handleUnauthorized`) can have
 * several mutations and queries in flight at once, all rejecting with the
 * same 401 within the same tick. Each would otherwise trigger its own
 * "session expired" error toast from the mutation cache's default
 * `onError` (lib/query/query-provider.tsx) right as `router.replace`
 * navigates the user to `/login` -- a burst of duplicate toasts the user
 * has no time to read before the page changes underneath them.
 *
 * `handleUnauthorized` marks this flag before it navigates; the mutation
 * cache checks it and skips the toast while it is set. The flag clears
 * itself shortly after so it never suppresses a *later*, unrelated 401
 * (signing back in and then losing the session again).
 */
const SUPPRESS_WINDOW_MS = 2000;

let suppressUntil = 0;

export function markAuthRedirect(): void {
  suppressUntil = Date.now() + SUPPRESS_WINDOW_MS;
}

export function isAuthRedirecting(): boolean {
  return Date.now() < suppressUntil;
}
