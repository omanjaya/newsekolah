import type { ReactElement } from "react";

import { LateArrivalPageView } from "../../../../features/permits/components/late-arrival-page-view";

/**
 * Deep link target for late-arrival notifications (the API sends href
 * "/late-arrivals/{instanceId}") and the student's history rows.
 */
export default async function LateArrivalPage({
  params,
}: {
  params: Promise<{ instanceId: string }>;
}): Promise<ReactElement> {
  const { instanceId } = await params;
  return <LateArrivalPageView id={instanceId} />;
}
