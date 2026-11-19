import type { ReactElement } from "react";

import { RouteGuard } from "../../../../components/route-guard";
import { MySupervisionReportView } from "../../../../features/supervision/components/my-supervision-report-view";
import { SUPERVISION_READ_PERMISSIONS } from "../../../../features/supervision/lib/permissions";

export default function MySupervisionReportPage(): ReactElement {
  return (
    <RouteGuard anyPermission={SUPERVISION_READ_PERMISSIONS}>
      <MySupervisionReportView />
    </RouteGuard>
  );
}
