import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ACCESS_COOKIE_NAME } from "../../../../lib/session/access-cookie";

/** Drop the server-rendering access cookie before an actor switch. */
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
