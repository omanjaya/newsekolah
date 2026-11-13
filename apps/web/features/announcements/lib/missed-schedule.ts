import type { Announcement } from "../api";

/**
 * A draft whose start time has already passed: either it was scheduled and
 * came due while the school had announcements switched off (the API then
 * holds it back as a draft instead of publishing it late), or it was saved
 * with a start in the past. Either way it needs a new start before it can
 * be scheduled again, so staff decide whether to reschedule, publish now or
 * delete it.
 */
export function isMissedSchedule(
  announcement: Pick<Announcement, "status" | "starts_at">,
  now: Date,
): boolean {
  if (announcement.status !== "draft" || !announcement.starts_at) return false;
  return new Date(announcement.starts_at).getTime() <= now.getTime();
}
