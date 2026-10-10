import { useInboxCountsQuery } from "./api";
import { useInboxAccess } from "./lib/access";
import { useInboxCountsLive } from "./realtime";

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

function useInboxSummary(keepFresh: boolean): ActionInboxSummary {
  const access = useInboxAccess();
  useInboxCountsLive(access, keepFresh);

  const enabled = access.leave || access.exit || access.late || access.warningLetters;
  const query = useInboxCountsQuery(enabled, keepFresh);
  const data = query.data;

  // A queue the reader has no screen for stays 0 even if the server
  // counted something for it (exit and late are open to any caller).
  const counts = {
    leave: access.leave ? (data?.leave ?? 0) : 0,
    exit: access.exit ? (data?.exit ?? 0) : 0,
    late: access.late ? (data?.late ?? 0) : 0,
    warningLetters: access.warningLetters ? (data?.warning_letters ?? 0) : 0,
  };

  return {
    ...counts,
    total: counts.leave + counts.exit + counts.late + counts.warningLetters,
    isLoading: enabled && query.isLoading,
    isError: enabled && query.isError,
  };
}

/**
 * Per-queue pending counts for what the reader can act on, from a single
 * counts request (the server applies each queue's own scoping). Every
 * caller shares one cached query, and a reader with no queue at all makes
 * no request. This reader only displays the cache; useActionInboxCount,
 * mounted once in the app shell, is what polls and listens for realtime.
 */
export function useActionInboxSummary(): ActionInboxSummary {
  return useInboxSummary(false);
}

/**
 * Total items waiting on the reader across every inbox queue; 0 while
 * loading. The app shell mounts this on every page, so it alone keeps the
 * shared counts fresh (120 s poll while visible, plus realtime invalidation).
 */
export function useActionInboxCount(): number {
  return useInboxSummary(true).total;
}
