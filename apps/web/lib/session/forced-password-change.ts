import type { Me } from "./session-provider";

/**
 * Whether this session must set a new password before it may use the app.
 *
 * The forced change belongs to the person who signs in with the account's
 * initial password. An impersonation (or role testing) session is an
 * administrator acting as the account: they do not know that password,
 * and the only way back to their own account is the impersonation strip in
 * the app shell. Sending them to /change-password would trap them there
 * with nothing but a full sign-out, so the strip names the pending change
 * instead.
 */
export function needsForcedPasswordChange(me: Me | null | undefined): boolean {
  return Boolean(me?.must_change_password) && !me?.impersonated_by;
}
