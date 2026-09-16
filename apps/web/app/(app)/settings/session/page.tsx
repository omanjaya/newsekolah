import type { ReactElement } from "react";

import { RouteGuard } from "../../../../components/route-guard";
import { SessionSettingsView } from "../../../../features/settings/components/session-settings-view";

export default function SessionSettingsPage(): ReactElement {
  return (
    <RouteGuard requiredPermission="manage_settings">
      <SessionSettingsView />
    </RouteGuard>
  );
}
