import type { ReactElement } from "react";

import { RouteGuard } from "../../../../components/route-guard";
import { MySupervisionReportView } from "../../../../features/supervision/components/my-supervision-report-view";

export default function MySupervisionReportPage(): ReactElement {
  return (
    <RouteGuard requiredPermission="view_supervision">
      <MySupervisionReportView />
    </RouteGuard>
  );
}
