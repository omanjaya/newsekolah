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
 * fresh token. The Origin check still keeps other sites from calling it.
 */
export function POST(request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");
  // Next may build nextUrl with its internal hostname behind Caddy. The
  // proxy preserves Host and supplies the browser-facing protocol.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const protocol =
    request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.slice(0, -1);
  if (origin && origin !== `${protocol}://${host}`) {
    return new NextResponse(null, { status: 403 });
  }
  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete(ACCESS_COOKIE_NAME);
  return response;
}
