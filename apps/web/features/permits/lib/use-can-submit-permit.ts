import { useCan, useSession } from "../../../lib/session/session-provider";

/**
 * Whether the reader files their own leave, exit and late requests. The
 * permission alone is not enough: an admin holds every permission but is no
 * student, so a "my requests" flow (and its submit buttons) would be an
 * account with nothing to file. Only student accounts file requests.
 */
export function useCanSubmitPermit(): boolean {
  const canSubmit = useCan("submit_leave_requests");
  const { me } = useSession();
  return canSubmit && me?.profile_kind === "student";
}
