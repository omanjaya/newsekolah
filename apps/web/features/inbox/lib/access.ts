import { useModuleEnabled } from "../../../lib/modules/use-module-enabled";
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
 * server-side), and warning-letter issuing. Leave, exit and late queues are
 * permits data and warning letters are discipline data, so a school that
 * switched either module off loses those queues here, which also drops
 * their section, their counts and their realtime topics.
 */
export function useInboxAccess(): InboxAccess {
  const { me } = useSession();
  const canLeave = useCan("review_leave_requests");
  const canApprove = useCan("issue_scan_tokens");
  const canGate = useCan("scan_exit_permits");
  const canWarn = useCan("issue_warning_letters");
  const permitsOn = useModuleEnabled("permits");
  const disciplineOn = useModuleEnabled("discipline");
  return {
    leave: permitsOn && canLeave,
    exit: permitsOn && (canApprove || canGate),
    late: permitsOn && (me?.profile_kind === "teacher" || me?.profile_kind === "staff"),
    warningLetters: disciplineOn && canWarn,
  };
}
