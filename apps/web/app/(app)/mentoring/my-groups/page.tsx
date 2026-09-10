import type { ReactElement } from "react";

import { RouteGuard } from "../../../../components/route-guard";
import { MyMentorGroupsView } from "../../../../features/mentoring/components/my-mentor-groups-view";

export default function MyMentorGroupsPage(): ReactElement {
  return (
    <RouteGuard requiredPermission="view_mentoring">
      <MyMentorGroupsView />
    </RouteGuard>
  );
}
