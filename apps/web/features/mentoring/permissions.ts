import { useTranslations } from "next-intl";

import { useCan } from "../../lib/session/session-provider";

/**
 * Who opens a mentor group's own pages (my groups, a group, a student of
 * it): the school-wide reader (view_mentoring) or the guru wali, whose
 * manage_mentoring the API scopes to the groups they mentor.
 */
export const MENTOR_PERMISSIONS = ["view_mentoring", "manage_mentoring"] as const;

/**
 * Where a group's trail leads back to: every group ("Kelompok mentoring")
 * for the school-wide reader, the reader's own groups ("Mentoring saya")
 * for a guru wali, who cannot open the full list. A group's pages pass it
 * as their trail's first step instead of the one AppPage derives from the
 * path, which is always the full list.
 */
export function useMentorGroupsCrumb(): { label: string; href: string } {
  const t = useTranslations("app.mentoring");
  return useCan("view_mentoring")
    ? { label: t("navLabelGroups"), href: "/mentoring/groups" }
    : { label: t("navLabelMyGroups"), href: "/mentoring/my-groups" };
}
