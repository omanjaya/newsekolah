import { ACCESS_COOKIE_MAX_AGE_SECONDS, STALE_ACCESS_COOKIE_NAME } from "./access-cookie";

/** The route that expires `sat` (app/api/session/clear-access-cookie/route.ts). */
export const CLEAR_ACCESS_COOKIE_PATH = "/api/session/clear-access-cookie";

/** How long the route gets to answer before its removal counts as failed. */
export const CLEAR_ACCESS_COOKIE_TIMEOUT_MS = 3000;

/** The route did not expire `sat`: it refused, failed, or did not answer in time. */
export class ServerAccessCookieError extends Error {
  constructor() {
    super("Could not clear the server access cookie");
    this.name = "ServerAccessCookieError";
  }
}

/**
 * Expires `sat`, the httpOnly access cookie middleware mints so the server
 * can render a page with `/v1/me` already loaded (lib/session/access-cookie.ts).
 * It names whoever was signed in when middleware last saw a page load, the
 * browser cannot remove it, and middleware replaces it only once it is
 * gone. A server render while it still names the previous account loads
 * that account's `/v1/me` and hydrates it over the new one: a reload, or
 * the first navigation into the app after a sign-in. So every change of
 * who is signed in deals with it before the request or navigation that
 * would render as the new account.
 *
 * Throws `ServerAccessCookieError` when the cookie was not removed,
 * including when the route has not answered within
 * `CLEAR_ACCESS_COOKIE_TIMEOUT_MS`. For the privileged switches (the start
 * of an impersonation, role testing), which do not happen then; a sign-in
 * uses `retireServerAccessCookie`.
 */
export async function clearServerAccessCookie(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, CLEAR_ACCESS_COOKIE_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(CLEAR_ACCESS_COOKIE_PATH, {
      method: "POST",
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch {
    throw new ServerAccessCookieError();
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new ServerAccessCookieError();
}

/**
 * `clearServerAccessCookie` for a sign-in, which nothing on this side may
 * keep from happening, and for the end of an impersonation. When the route
 * refuses, fails or does not answer in time, it marks `sat` stale instead
 * (`STALE_ACCESS_COOKIE_NAME`): the server render then ignores `sat`, and
 * middleware replaces it on the next page load. Never throws.
 */
export async function retireServerAccessCookie(): Promise<void> {
  try {
    await clearServerAccessCookie();
  } catch {
    markServerAccessCookieStale();
  }
}

function markServerAccessCookieStale(): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${STALE_ACCESS_COOKIE_NAME}=1; Path=/; Max-Age=${ACCESS_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}
