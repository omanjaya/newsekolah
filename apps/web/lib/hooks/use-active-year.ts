"use client";

import { useSession } from "../session/session-provider";

/**
 * The active academic year comes with `/v1/me`, so every list that needs a
 * year filter reads it from the session instead of fetching the year list.
 * Returns an empty id while the session is loading; callers pass
 * `enabled: yearId !== ""` to their queries.
 */
export function useActiveYear(): { id: string; label: string } {
  const { me } = useSession();
  return { id: me?.active_academic_year?.id ?? "", label: me?.active_academic_year?.label ?? "" };
}
