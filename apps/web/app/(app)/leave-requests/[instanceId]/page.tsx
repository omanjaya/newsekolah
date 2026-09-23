import type { ReactElement } from "react";

import { LeaveRequestPageView } from "../../../../features/permits/components/leave-request-page-view";

/**
 * Deep link target for leave-request notifications (the API sends
 * href "/leave-requests/{instanceId}"). This is how a counselor who can
 * issue letters but not list the review queue reaches a request.
 */
export default async function LeaveRequestPage({
  params,
}: {
  params: Promise<{ instanceId: string }>;
}): Promise<ReactElement> {
  const { instanceId } = await params;
  return <LeaveRequestPageView id={instanceId} />;
}
