import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { API_INTERNAL_URL } from "./lib/env";
import {
  ACCESS_COOKIE_MAX_AGE_SECONDS,
  ACCESS_COOKIE_NAME,
  isProtectedDocumentNavigation,
} from "./lib/session/access-cookie";

const REFRESH_TOKEN_COOKIE_NAME = "refresh_token";

/**
 * docs/08-security.md section 7: strict CSP with a per-request nonce,
 * HSTS, nosniff, referrer-policy, and a locked-down permissions-policy.
 * The nonce is threaded to Server Components through the `x-nonce`
 * request header (there is no other channel from middleware into the
 * render tree) so the inline theme-bootstrap script in app/layout.tsx can
 * carry a matching `nonce` attribute instead of relying on 'unsafe-inline'.
 *
 * Also runs the server-side access-cookie refresh (docs/08-security.md
 * section 2, "Server-side access cookie"): on a genuine document
 * navigation into the `(app)` route group, mints/renews the httpOnly `sat`
 * cookie that `lib/session/dehydrate-app-query-client.server.ts` reads to
 * prefetch `GET /v1/me`. This is bounded by the access token's TTL, not
 * run on every navigation -- see `maybeRefreshAccessCookie` below.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
  let apiOrigin = "";
  let wsOrigin = "";
  try {
    const parsed = new URL(apiUrl);
    apiOrigin = parsed.origin;
    wsOrigin = `${parsed.protocol === "https:" ? "wss:" : "ws:"}//${parsed.host}`;
  } catch {
    // NEXT_PUBLIC_API_URL missing or invalid: connect-src falls back to 'self' only.
  }

  const csp = [
    "default-src 'self'",
    // Next's dev runtime evaluates source-mapped chunks with eval; production
    // builds do not, so 'unsafe-eval' never reaches a deployed policy.
    // accounts.google.com is Google Identity Services, loaded only by the
    // login screen's "Sign in with Google" button (features/auth); it is
    // allowed unconditionally here because middleware runs before any
    // tenant's SSO configuration is known.
    `script-src 'self' 'nonce-${nonce}' https://accounts.google.com${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src 'self' https://accounts.google.com ${apiOrigin} ${wsOrigin}`.trim(),
    "frame-src https://accounts.google.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");

  await maybeRefreshAccessCookie(request, response);

  return response;
}

/**
 * Mints/renews the middleware-owned `sat` access cookie so
 * `dehydrate-app-query-client.server.ts` can prefetch `GET /v1/me` on the
 * next navigation. Deliberately conservative:
 *
 * - Only for a genuine document GET into `(app)` (`isProtectedDocumentNavigation`).
 * - Only when `sat` is absent. Because `sat`'s own `maxAge` already reserves
 *   `REFRESH_SAFETY_MARGIN_SECONDS` before the access token's real expiry,
 *   "absent" is the single correct trigger -- there is no separate
 *   boundary case to special-case here (see access-cookie.ts).
 * - Exactly one refresh attempt, never retried. A second attempt with the
 *   same `refresh_token` cookie value IS the reuse the API's rotation
 *   (docs/08-security.md section 2) treats as theft and would revoke the
 *   entire session family -- so on any failure this clears `sat` and
 *   passes the request through untouched; the existing client-side
 *   `RouteGuard` redirects to `/login` exactly as it does today.
 * - No CSRF surface added: the API never accepts a cookie for anything but
 *   this one endpoint, and never for authenticating a mutation (those use
 *   the bearer access token from memory).
 * - Never logs a token value.
 */
async function maybeRefreshAccessCookie(
  request: NextRequest,
  response: NextResponse,
): Promise<void> {
  const isProtected = isProtectedDocumentNavigation({
    method: request.method,
    pathname: request.nextUrl.pathname,
    secFetchDest: request.headers.get("sec-fetch-dest"),
    nextRouterPrefetch: request.headers.get("next-router-prefetch"),
    rsc: request.headers.get("rsc"),
  });
  if (!isProtected) return;
  if (request.cookies.get(ACCESS_COOKIE_NAME)) return;

  if (!request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)) {
    // No session (or one that outlived its refresh token entirely): let the
    // client-side RouteGuard send the user to /login as it does today.
    return;
  }
  if (!API_INTERNAL_URL) return;

  const incomingCookie = request.headers.get("cookie") ?? "";

  let refreshResponse: Response;
  try {
    refreshResponse = await fetch(`${API_INTERNAL_URL}/v1/auth/refresh`, {
      method: "POST",
      // Forwarded verbatim, not reconstructed from `refresh_token` alone,
      // per docs/08-security.md: the API's own cookie-parsing middleware is
      // the single place that decides what counts as "the" refresh cookie.
      headers: { cookie: incomingCookie },
      // No Origin header is set here on purpose: this is a server-to-server
      // call, not a browser request, so none would naturally be present.
      // httpx.OriginAllowed treats a missing Origin as a native client and
      // allows it -- the same leniency already applied to mobile clients,
      // not a new exception introduced by this code.
      cache: "no-store",
    });
  } catch {
    // Network failure talking to the API: behave as if there were no
    // session to refresh. The client's own boot refresh still covers it.
    return;
  }

  if (!refreshResponse.ok) {
    response.cookies.delete(ACCESS_COOKIE_NAME);
    return;
  }

  let body: { access_token?: unknown };
  try {
    body = (await refreshResponse.json()) as { access_token?: unknown };
  } catch {
    return;
  }
  if (typeof body.access_token !== "string" || body.access_token === "") return;

  // `response.cookies.set()` re-serializes the *entire* Set-Cookie header
  // set from its own internal cookie map every time it runs, which would
  // silently discard a raw header appended before it -- so every
  // `response.cookies` mutation for `sat` happens first, and the rotated
  // `refresh_token` cookie is relayed as a raw header last.
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: body.access_token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE_SECONDS,
  });

  relayRotatedRefreshCookie(refreshResponse.headers, response);
}

/**
 * Relays the API's rotated `refresh_token` Set-Cookie header onto the
 * middleware response verbatim -- attributes (Path, Secure, SameSite,
 * Expires) are whatever the API decided, never re-derived here.
 * `Headers.getSetCookie()` is used when available so multiple Set-Cookie
 * headers are not collapsed into one comma-joined string; today's
 * `POST /v1/auth/refresh` only ever sets the one cookie, but this stays
 * correct if that changes.
 */
function relayRotatedRefreshCookie(apiHeaders: Headers, response: NextResponse): void {
  const withGetSetCookie = apiHeaders as Headers & { getSetCookie?: () => string[] };
  const values =
    typeof withGetSetCookie.getSetCookie === "function"
      ? withGetSetCookie.getSetCookie()
      : ((value) => (value ? [value] : []))(apiHeaders.get("set-cookie"));

  for (const value of values) {
    response.headers.append("set-cookie", value);
  }
}

export const config = {
  matcher: [
    /*
     * Every route except static assets and the service worker, which are
     * served as-is and don't render the nonce-carrying HTML shell.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js).*)",
  ],
};
