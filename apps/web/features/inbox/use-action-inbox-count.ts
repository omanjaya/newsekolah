import { useDisciplinePolicyQuery, useSPCandidatesQuery } from "../discipline/api";
import { dueLevels } from "../discipline/lib/sp-due-levels";
import {
  useExitPermitReviewQueueQuery,
  useLateArrivalQueueQuery,
  useLeaveReviewQueueQuery,
} from "../permits/api";

import { useInboxAccess } from "./lib/access";

/** One fixed page so every reader shares a single cached candidates request. */
export const INBOX_SP_FILTERS = { classId: "", level: "", search: "", limit: 200, offset: 0 };

export interface ActionInboxSummary {
  leave: number;
  exit: number;
  late: number;
  warningLetters: number;
  total: number;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Per-queue pending counts for what the reader can act on. Each query is the
 * one the queue components already run (same key), so React Query dedupes
 * and a disabled queue costs no request.
 */
export function useActionInboxSummary(): ActionInboxSummary {
  const access = useInboxAccess();
  const leave = useLeaveReviewQueueQuery(access.leave);
  const exit = useExitPermitReviewQueueQuery(access.exit);
  const late = useLateArrivalQueueQuery(access.late);
  const policy = useDisciplinePolicyQuery(access.warningLetters);
  const candidates = useSPCandidatesQuery(INBOX_SP_FILTERS, access.warningLetters);

  const levels = policy.data?.levels ?? [];
  const counts = {
    leave: access.leave ? (leave.data?.data.length ?? 0) : 0,
    exit: access.exit ? (exit.data?.data.length ?? 0) : 0,
    late: access.late ? (late.data?.data.length ?? 0) : 0,
    warningLetters: access.warningLetters
      ? (candidates.data?.data ?? []).filter((c) => dueLevels(c, levels).length > 0).length
      : 0,
  };
  const active = [
    access.leave ? leave : null,
    access.exit ? exit : null,
    access.late ? late : null,
    access.warningLetters ? policy : null,
    access.warningLetters ? candidates : null,
  ].filter((query) => query !== null);

  return {
    ...counts,
    total: counts.leave + counts.exit + counts.late + counts.warningLetters,
    isLoading: active.some((query) => query.isLoading),
    isError: active.some((query) => query.isError),
  };
}

/** Total items waiting on the reader across every inbox queue; 0 while loading. */
export function useActionInboxCount(): number {
  return useActionInboxSummary().total;
}
