/**
 * Mirrors apps/web/lib/session/auth-redirect-flag.ts: losing the session
 * mid-visit (AuthProvider's `handleSessionExpired`, wired to
 * @newsekolah/api-client's `onUnauthorized` in lib/api/client.ts) can leave
 * several mutations rejecting with the same 401 in the same tick, right as
 * the app falls back to the signed-out stack. Without this, the mutation
 * cache's default error toast (mutation-cache.ts) would show its own
 * "session expired" for every one of them.
 */
const SUPPRESS_WINDOW_MS = 2000;

let suppressUntil = 0;

export function markAuthRedirect(): void {
  suppressUntil = Date.now() + SUPPRESS_WINDOW_MS;
}

export function isAuthRedirecting(): boolean {
  return Date.now() < suppressUntil;
}
