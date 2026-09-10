import type { ReactElement } from "react";

import { RouteGuard } from "../../../../components/route-guard";
import { MentorGroupsView } from "../../../../features/mentoring/components/mentor-groups-view";

export default function MentorGroupsPage(): ReactElement {
  return (
    <RouteGuard requiredPermission="view_mentoring">
      <MentorGroupsView />
    </RouteGuard>
  );
}
