/**
 * The reader's feed opened on one announcement. The API's notifications
 * link here, and `/announcements/{id}`, which older notifications still
 * carry, redirects here: the web has no page per announcement.
 */
export function announcementFocusHref(id: string): string {
  return `/announcements?focus=${encodeURIComponent(id)}`;
}
