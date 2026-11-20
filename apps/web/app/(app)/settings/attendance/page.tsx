import type { ReactElement } from "react";

import { RouteGuard } from "../../../../components/route-guard";
import { AttendanceSettingsView } from "../../../../features/settings/components/attendance-settings-view";

export default function AttendanceSettingsPage(): ReactElement {
  return (
    <RouteGuard requiredPermission="manage_settings">
      <AttendanceSettingsView />
    </RouteGuard>
  );
}
