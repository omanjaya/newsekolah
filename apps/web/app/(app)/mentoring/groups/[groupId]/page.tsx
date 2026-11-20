import type { ReactElement } from "react";

import { RouteGuard } from "../../../../../components/route-guard";
import { MentorGroupDetailView } from "../../../../../features/mentoring/components/mentor-group-detail-view";
import { MENTOR_PERMISSIONS } from "../../../../../features/mentoring/permissions";

export default async function MentorGroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}): Promise<ReactElement> {
  const { groupId } = await params;
  return (
    <RouteGuard anyPermission={MENTOR_PERMISSIONS}>
      <MentorGroupDetailView groupId={groupId} />
    </RouteGuard>
  );
}
