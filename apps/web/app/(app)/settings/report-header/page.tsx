import type { ReactElement } from "react";

import { RouteGuard } from "../../../../components/route-guard";
import { ReportHeaderView } from "../../../../features/settings/components/report-header-view";

export default function ReportHeaderPage(): ReactElement {
  return (
    <RouteGuard requiredPermission="manage_settings">
      <ReportHeaderView />
    </RouteGuard>
  );
}
