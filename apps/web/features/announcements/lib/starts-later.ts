import type { Announcement } from "../api";

/**
 * Whether an announcement's start is still ahead of `now`. Publishing such
 * an announcement makes it published at once, but readers see it and are
 * notified only from its start (the API leaves that notification to its
 * due-notify job), so the publish confirmation and the result both name
 * that date instead of saying it was sent.
 */
export function startsLater(announcement: Pick<Announcement, "starts_at">, now: Date): boolean {
  if (!announcement.starts_at) return false;
  return new Date(announcement.starts_at).getTime() > now.getTime();
}
