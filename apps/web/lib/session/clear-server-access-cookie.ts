/** The route that expires `sat` (app/api/session/clear-access-cookie/route.ts). */
export const CLEAR_ACCESS_COOKIE_PATH = "/api/session/clear-access-cookie";

/**
 * Expires `sat`, the httpOnly access cookie middleware mints so the server
 * can render a page with `/v1/me` already loaded (lib/session/access-cookie.ts).
 * It names whoever was signed in when middleware last saw a page load, the
 * browser cannot remove it, and middleware replaces it only once it is
 * gone. A server render while it still names the previous account loads
 * that account's `/v1/me` and hydrates it over the new one: a reload, or
 * the first navigation into the app after a sign-in. So every change of
 * who is signed in calls this before the request or navigation that would
 * render as the new account. Throws when the cookie was not removed.
 */
export async function clearServerAccessCookie(): Promise<void> {
  const response = await fetch(CLEAR_ACCESS_COOKIE_PATH, {
    method: "POST",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Could not clear the server access cookie");
}
