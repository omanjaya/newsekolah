"use client";

import { useMemo } from "react";

import { type Me, useSession } from "../../../lib/session/session-provider";

/** A list on the Konseling BK page. */
export type CounselingTab = "mine" | "bkTeam" | "leadership";

/**
 * What a reader may do with counseling notes. The API decides per note
 * (visibility "counselor", "bk_team" or "leadership"); this mirrors it so
 * the web never offers a list that can only answer with an error:
 * - canWrite: manage_counseling (the counselor duty, or an admin), who
 *   records notes and keeps "Catatan saya".
 * - canRead: canWrite, or view_counseling (the principal and the
 *   leadership duty), who read the notes shared with them.
 * - isCounselor: the counselor duty, the only reader of "Tim BK" notes.
 * - isLeadership: the leadership duty or the principal role, the readers
 *   of notes shared with "Pimpinan".
 */
export interface CounselingAccess {
  canRead: boolean;
  canWrite: boolean;
  isCounselor: boolean;
  isLeadership: boolean;
}

type CounselingReader = Pick<Me, "permissions" | "roles"> & {
  duties?: readonly { slug: string }[];
};

export function counselingAccess(me: CounselingReader | undefined): CounselingAccess {
  const permissions = me?.permissions ?? [];
  const duties = me?.duties ?? [];
  const canWrite = permissions.includes("manage_counseling");
  return {
    canWrite,
    canRead: canWrite || permissions.includes("view_counseling"),
    isCounselor: duties.some((duty) => duty.slug === "counselor"),
    isLeadership:
      duties.some((duty) => duty.slug === "leadership") ||
      (me?.roles ?? []).some((role) => role.slug === "principal"),
  };
}

/**
 * The lists a reader gets on the Konseling BK page, in order. A reader
 * who can only read and is not leadership (a custom role) still gets the
 * leadership list, whose empty or refused state explains itself.
 */
export function counselingTabs(access: CounselingAccess): CounselingTab[] {
  const tabs: CounselingTab[] = [];
  if (access.canWrite) tabs.push("mine");
  if (access.isCounselor) tabs.push("bkTeam");
  if (access.isLeadership || (access.canRead && !access.canWrite)) tabs.push("leadership");
  return tabs;
}

export function useCounselingAccess(): CounselingAccess {
  const { me } = useSession();
  return useMemo(() => counselingAccess(me), [me]);
}
