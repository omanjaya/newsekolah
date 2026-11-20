import { useCan } from "../../lib/session/session-provider";

/**
 * Who opens a mentor group's own pages (my groups, a group, a student of
 * it): the school-wide reader (view_mentoring) or the guru wali, whose
 * manage_mentoring the API scopes to the groups they mentor.
 */
export const MENTOR_PERMISSIONS = ["view_mentoring", "manage_mentoring"] as const;

/**
 * Where a group's trail leads back to: every group for the school-wide
 * reader, the reader's own groups for a guru wali (who cannot open the
 * full list).
 */
export function useMentorGroupsHref(): string {
  return useCan("view_mentoring") ? "/mentoring/groups" : "/mentoring/my-groups";
}
