import type { ReactElement } from "react";

import { RouteGuard } from "../../../../components/route-guard";
import { ScheduleBulkView } from "../../../../features/schedule/components/schedule-bulk-view";

export default function ScheduleBulkPage(): ReactElement {
  return (
    <RouteGuard requiredPermission="manage_schedules">
      <ScheduleBulkView />
    </RouteGuard>
  );
}
