import type { ReactElement } from "react";

import { RouteGuard } from "../../../../components/route-guard";
import { NotificationDefaultsView } from "../../../../features/settings/components/notification-defaults-view";

export default function NotificationDefaultsPage(): ReactElement {
  return (
    <RouteGuard requiredPermission="manage_notification_settings">
      <NotificationDefaultsView />
    </RouteGuard>
  );
}
