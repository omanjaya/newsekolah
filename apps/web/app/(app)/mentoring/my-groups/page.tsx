import type { ReactElement } from "react";

import { RouteGuard } from "../../../../components/route-guard";
import { MyMentorGroupsView } from "../../../../features/mentoring/components/my-mentor-groups-view";
import { MENTOR_PERMISSIONS } from "../../../../features/mentoring/permissions";

export default function MyMentorGroupsPage(): ReactElement {
  return (
    <RouteGuard anyPermission={MENTOR_PERMISSIONS}>
      <MyMentorGroupsView />
    </RouteGuard>
  );
}
