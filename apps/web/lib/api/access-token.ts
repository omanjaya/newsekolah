/**
 * The access token lives in this module-scoped variable only, never in
 * localStorage or a cookie readable by JavaScript (docs/08-security.md
 * section 2). This file is only ever imported from client components
 * ("use client"), so on the server it stays an inert, always-null module:
 * nothing here runs during server-side rendering, and no request handler
 * reads or writes it, so it can never leak a token between two users'
 * requests on a shared server process.
 */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
