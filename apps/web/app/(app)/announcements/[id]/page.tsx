import { redirect } from "next/navigation";

import { announcementFocusHref } from "../../../../features/announcements/lib/focus-href";

/**
 * Older announcement notifications link to "/announcements/{id}"; they land
 * on the feed opened on that announcement instead of a 404.
 */
export default async function AnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<never> {
  const { id } = await params;
  redirect(announcementFocusHref(id));
}
