import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * docs/08-security.md section 7: strict CSP with a per-request nonce,
 * HSTS, nosniff, referrer-policy, and a locked-down permissions-policy.
 * The nonce is threaded to Server Components through the `x-nonce`
 * request header (there is no other channel from middleware into the
 * render tree) so the inline theme-bootstrap script in app/layout.tsx can
 * carry a matching `nonce` attribute instead of relying on 'unsafe-inline'.
 */
export function middleware(request: NextRequest) {
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
    `script-src 'self' 'nonce-${nonce}'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin} ${wsOrigin}`.trim(),
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
  return response;
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
