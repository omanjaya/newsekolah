import type { ReactElement } from "react";

import { RouteGuard } from "../../../../../components/route-guard";
import { MentorGroupDetailView } from "../../../../../features/mentoring/components/mentor-group-detail-view";

export default async function MentorGroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}): Promise<ReactElement> {
  const { groupId } = await params;
  return (
    <RouteGuard requiredPermission="view_mentoring">
      <MentorGroupDetailView groupId={groupId} />
    </RouteGuard>
  );
}
