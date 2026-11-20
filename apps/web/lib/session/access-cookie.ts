/**
 * Constants and pure decision logic shared between `middleware.ts` (which
 * mints/reads this cookie) and `dehydrate-app-query-client.server.ts`
 * (which reads it to prefetch `GET /v1/me`). Kept dependency-free so both
 * call sites -- one Edge/Node middleware, one Server Component -- can import
 * it without pulling in `next/server` or `next/headers`.
 *
 * See docs/08-security.md section 2 ("Server-side access cookie") for the
 * design this implements.
 */

/** httpOnly cookie middleware mints holding a short-lived API access token. */
export const ACCESS_COOKIE_NAME = "sat";

/**
 * Plain cookie the browser sets when it could not remove `sat` before a
 * change of identity (lib/session/clear-server-access-cookie.ts), so `sat`
 * may still name the previous account. While it is there the server
 * render does not use `sat`, and middleware treats `sat` as absent: the
 * next document navigation into `(app)` mints a new one from the refresh
 * cookie and removes this marker. It lasts `ACCESS_COOKIE_MAX_AGE_SECONDS`,
 * as long as any `sat` that existed when it was set.
 */
export const STALE_ACCESS_COOKIE_NAME = "sat_stale";

/** Matches the API's default `ACCESS_TOKEN_TTL` (apps/api/internal/platform/config/config.go: "15m"). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/**
 * How much earlier than the access token's real expiry the cookie itself
 * expires. Chosen from the middle of the 30-60s range: long enough that
 * ordinary request/response latency and clock skew between this process and
 * the API cannot make the cookie outlive the token it names, short enough
 * to keep the "refresh once per TTL, not once per navigation" property
 * useful (this margin is the only thing subtracted from a 15-minute TTL).
 */
export const REFRESH_SAFETY_MARGIN_SECONDS = 45;

/**
 * The access cookie's own `maxAge`. Because the browser stops sending a
 * cookie once its `maxAge` elapses, "the cookie is present" already implies
 * "the access token has at least `REFRESH_SAFETY_MARGIN_SECONDS` of real
 * validity left" -- no separate expiry check is needed at read time, in
 * middleware or in the dehydrate helper (see docs/08-security.md).
 */
export const ACCESS_COOKIE_MAX_AGE_SECONDS =
  ACCESS_TOKEN_TTL_SECONDS - REFRESH_SAFETY_MARGIN_SECONDS;

/**
 * Path prefixes that never belong to the `(app)` route group and must
 * never trigger a middleware-driven refresh: the `(auth)` and `(public)`
 * route groups, Next's own asset/route-handler paths, and the static files
 * `middleware.ts`'s matcher does not already exclude.
 */
const EXCLUDED_PATH_PREFIXES = [
  "/_next",
  "/api",
  "/login",
  "/forgot-password",
  "/change-password",
  "/reset-password",
  "/opac",
  "/offline",
  "/verify",
  "/branding-icon",
  "/manifest.webmanifest",
  "/sw.js",
  "/favicon.ico",
] as const;

/**
 * True for the `(auth)` and `(public)` routes (and static assets): pages an
 * anonymous visitor may stay on, so a failed session refresh must not
 * bounce them to `/login`.
 */
export function isExcludedPath(pathname: string): boolean {
  return underPrefix(pathname, EXCLUDED_PATH_PREFIXES);
}

export interface DocumentNavigationInput {
  method: string;
  pathname: string;
  /** `request.headers.get("sec-fetch-dest")`. */
  secFetchDest: string | null;
  /** `request.headers.get("next-router-prefetch")`: set on hover/viewport `<Link>` prefetches. */
  nextRouterPrefetch: string | null;
  /** `request.headers.get("rsc")`: set on React Server Component data requests, not document loads. */
  rsc: string | null;
}

/**
 * True only for a genuine full-document GET navigation into the `(app)`
 * route group. Everything else -- RSC data requests, `<Link>` prefetches,
 * non-GET methods, `/login` and other `(auth)`/`(public)` routes, `/api/*`
 * route handlers, `/_next/*` assets -- must pass straight through: a
 * refresh triggered by any of those would burn through the safety margin
 * for no benefit (prefetches and RSC requests do not render a page a user
 * is looking at) or run somewhere the resulting cookies would never be
 * read (`/login` has no `(app)` session to serve).
 *
 * A browser that omits `Sec-Fetch-Dest` (very old browsers) is treated as
 * "not a document navigation" -- the conservative choice, since the worst
 * case is falling back to the pre-existing client-side boot refresh rather
 * than firing a POST /v1/auth/refresh through a header this code cannot
 * actually confirm is a page load.
 */
export function isProtectedDocumentNavigation(input: DocumentNavigationInput): boolean {
  if (input.method !== "GET") return false;
  if (input.nextRouterPrefetch) return false;
  if (input.rsc) return false;
  if (input.secFetchDest !== "document") return false;
  return !isExcludedPath(input.pathname);
}

/** The API's httpOnly refresh cookie (apps/api/internal/platform/httpx/cookie.go). */
export const REFRESH_TOKEN_COOKIE_NAME = "refresh_token";

/** The `(public)` route group: pages anyone may read without a session. */
const PUBLIC_PATH_PREFIXES = ["/opac", "/offline", "/verify"] as const;

function underPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * True when the page needs no session and the document request carried
 * no refresh cookie (`sessionCookieSeen`, read by the root layout): an
 * anonymous visit to the catalogue or a document check. Such a page sends
 * neither `/v1/auth/refresh` nor `/v1/me`, whose 401s would only fill the
 * console. The sign-in pages are not public here: they read `me` to send
 * an already signed-in tab onward. Wherever the browser and this server
 * do not share the cookie, a signed-in reader is only offered "Masuk" in
 * the public header, which the sign-in page then sends onward.
 */
export function isAnonymousPublicVisit(pathname: string, sessionCookieSeen: boolean): boolean {
  return !sessionCookieSeen && underPrefix(pathname, PUBLIC_PATH_PREFIXES);
}
