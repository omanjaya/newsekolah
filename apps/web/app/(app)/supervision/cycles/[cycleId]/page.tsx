import type { ReactElement } from "react";

import { RouteGuard } from "../../../../../components/route-guard";
import { SupervisionCycleDetailView } from "../../../../../features/supervision/components/supervision-cycle-detail-view";

export default async function SupervisionCycleDetailPage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}): Promise<ReactElement> {
  const { cycleId } = await params;
  return (
    <RouteGuard requiredPermission="view_supervision">
      <SupervisionCycleDetailView cycleId={cycleId} />
    </RouteGuard>
  );
}
