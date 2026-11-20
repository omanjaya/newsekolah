import type { ReactElement } from "react";

import { ExitPermitPageView } from "../../../../features/permits/components/exit-permit-page-view";

/**
 * Deep link target for exit-permit notifications (the API sends href
 * "/exit-permits/{instanceId}").
 */
export default async function ExitPermitPage({
  params,
}: {
  params: Promise<{ instanceId: string }>;
}): Promise<ReactElement> {
  const { instanceId } = await params;
  return <ExitPermitPageView id={instanceId} />;
}
