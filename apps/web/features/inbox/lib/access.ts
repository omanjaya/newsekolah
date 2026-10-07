import { useCan, useSession } from "../../../lib/session/session-provider";

export interface InboxAccess {
  leave: boolean;
  exit: boolean;
  late: boolean;
  warningLetters: boolean;
}

/**
 * Which queues the reader can act on. Mirrors the gates the dedicated
 * screens already use: leave review, exit-permit approval or gate scan, the
 * duty-teacher late-arrival queue (every teacher/staff account, scoped
 * server-side), and warning-letter issuing.
 */
export function useInboxAccess(): InboxAccess {
  const { me } = useSession();
  const canLeave = useCan("review_leave_requests");
  const canApprove = useCan("issue_scan_tokens");
  const canGate = useCan("scan_exit_permits");
  const canWarn = useCan("issue_warning_letters");
  return {
    leave: canLeave,
    exit: canApprove || canGate,
    late: me?.profile_kind === "teacher" || me?.profile_kind === "staff",
    warningLetters: canWarn,
  };
}
