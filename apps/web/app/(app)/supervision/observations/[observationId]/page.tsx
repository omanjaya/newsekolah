import type { ReactElement } from "react";

import { RouteGuard } from "../../../../../components/route-guard";
import { ObservationDetailView } from "../../../../../features/supervision/components/observation-detail-view";

export default async function ObservationDetailPage({
  params,
}: {
  params: Promise<{ observationId: string }>;
}): Promise<ReactElement> {
  const { observationId } = await params;
  return (
    <RouteGuard requiredPermission="view_supervision">
      <ObservationDetailView observationId={observationId} />
    </RouteGuard>
  );
}
