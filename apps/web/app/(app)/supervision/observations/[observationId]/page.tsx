import type { ReactElement } from "react";

import { RouteGuard } from "../../../../../components/route-guard";
import { ObservationDetailView } from "../../../../../features/supervision/components/observation-detail-view";
import { SUPERVISION_READ_PERMISSIONS } from "../../../../../features/supervision/lib/permissions";

export default async function ObservationDetailPage({
  params,
}: {
  params: Promise<{ observationId: string }>;
}): Promise<ReactElement> {
  const { observationId } = await params;
  return (
    <RouteGuard anyPermission={SUPERVISION_READ_PERMISSIONS}>
      <ObservationDetailView observationId={observationId} />
    </RouteGuard>
  );
}
