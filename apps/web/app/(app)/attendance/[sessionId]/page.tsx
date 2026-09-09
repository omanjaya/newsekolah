import type { ReactElement } from "react";

import { SessionView } from "../../../../features/attendance/components/session-view";

export default async function AttendanceSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}): Promise<ReactElement> {
  const { sessionId } = await params;
  return <SessionView sessionId={sessionId} />;
}
