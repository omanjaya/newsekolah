import type { ReactElement } from "react";

import { RouteGuard } from "../../../../../../../components/route-guard";
import { CompleteObservationView } from "../../../../../../../features/supervision/components/complete-observation-view";

export default async function CompleteObservationPage({
  params,
}: {
  params: Promise<{ cycleId: string; scheduledId: string }>;
}): Promise<ReactElement> {
  const { cycleId, scheduledId } = await params;
  return (
    <RouteGuard requiredPermission="manage_supervision">
      <CompleteObservationView cycleId={cycleId} scheduledId={scheduledId} />
    </RouteGuard>
  );
}
