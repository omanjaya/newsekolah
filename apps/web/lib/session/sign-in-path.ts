/**
 * The `reason` the sign-in page reads to say why it is showing: the
 * session the reader was using ran out (or was revoked) mid-visit. Without
 * it a reader dropped on the bare form takes it for a random sign-out.
 */
export const SESSION_ENDED_REASON = "session-ended";

/**
 * The sign-in page with a way back to `next`, and, for a session that was
 * signed in and is now over, the reason the page names above its form.
 */
export function signInPath(next: string, { sessionEnded = false } = {}): string {
  const params = new URLSearchParams({ next });
  if (sessionEnded) params.set("reason", SESSION_ENDED_REASON);
  return `/login?${params.toString()}`;
}
