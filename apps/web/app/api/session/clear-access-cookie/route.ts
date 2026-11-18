import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ACCESS_COOKIE_NAME } from "../../../../lib/session/access-cookie";

/**
 * Expires `sat`, the server-rendering access cookie (lib/session/access-cookie.ts),
 * before the identity in this browser changes: every sign-in, the start
 * and the end of an impersonation, a role-testing switch. The browser
 * cannot remove it itself (it is httpOnly), and middleware only mints a
 * new one once it is gone. Called through `clearServerAccessCookie`
 * (lib/session/clear-server-access-cookie.ts).
 *
 * Needs no session on purpose: the sign-in page calls it before anyone is
 * signed in, and removing the cookie only makes the next page load fetch a
 * fresh token. It never touches the refresh cookie, so the worst another
 * site could do with it is cost one extra refresh; the same-origin check
 * keeps other sites from calling it all the same.
 */
export function POST(request: NextRequest): NextResponse {
  if (!sentByThisSite(request)) {
    return new NextResponse(null, { status: 403 });
  }
  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete(ACCESS_COOKIE_NAME);
  return response;
}

/**
 * True for a request a page of this site sent. Every current browser marks
 * a fetch with `Sec-Fetch-Site`, which no page can set or change, so
 * "same-origin" settles it without rebuilding this site's origin from what
 * a proxy forwards: a proxy that rewrites Host or does not forward the
 * scheme cannot turn a sign-in away. A browser too old to send it (Safari
 * before 16.4) is judged by `Origin` instead, which must then name this
 * site as the proxy forwards it; a request with neither is not a page's
 * cross-site request and is let through, as before.
 */
function sentByThisSite(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return originsOfThisSite(request).includes(origin);
}

/**
 * The origins this site may answer on. Behind Caddy (infra/caddy/Caddyfile,
 * and the shared system Caddy in infra/README.md) Host is the browser's
 * own and X-Forwarded-Proto its scheme. Another proxy may rewrite Host and
 * pass the public one in X-Forwarded-Host; behind a chain of proxies the
 * first value of each is the one the browser used. Next's own URL may name
 * its internal hostname, so it only comes last.
 */
function originsOfThisSite(request: NextRequest): string[] {
  const protocol =
    firstForwarded(request, "x-forwarded-proto") ?? request.nextUrl.protocol.slice(0, -1);
  const hosts = [
    firstForwarded(request, "x-forwarded-host"),
    request.headers.get("host"),
    request.nextUrl.host,
  ];
  return hosts.flatMap((host) => (host ? [`${protocol}://${host}`] : []));
}

function firstForwarded(request: NextRequest, name: string): string | null {
  const value = request.headers.get(name)?.split(",")[0]?.trim();
  if (!value) return null;
  return value;
}
