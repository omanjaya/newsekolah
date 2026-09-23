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

type AccessTokenListener = (token: string | null) => void;

const listeners = new Set<AccessTokenListener>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  if (token === accessToken) return;
  accessToken = token;
  for (const listener of [...listeners]) listener(token);
}

/**
 * Notifies `listener` every time the in-memory token changes (login, a
 * refresh, logout). For consumers that hold the token outside a request,
 * such as the realtime socket, which must reconnect with the new token
 * rather than retry a rejected one. Returns the unsubscribe function.
 */
export function subscribeAccessToken(listener: AccessTokenListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
