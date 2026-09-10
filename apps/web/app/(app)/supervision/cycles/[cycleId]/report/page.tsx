import type { ReactElement } from "react";

import { RouteGuard } from "../../../../../../components/route-guard";
import { SupervisionCycleReportView } from "../../../../../../features/supervision/components/supervision-cycle-report-view";

export default async function SupervisionCycleReportPage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}): Promise<ReactElement> {
  const { cycleId } = await params;
  return (
    <RouteGuard requiredPermission="view_supervision">
      <SupervisionCycleReportView cycleId={cycleId} />
    </RouteGuard>
  );
}
