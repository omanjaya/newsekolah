import type { ReactElement } from "react";

import { SessionView } from "../../../../features/attendance/components/session-view";

export default async function AttendanceSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ mode?: string }>;
}): Promise<ReactElement> {
  const { sessionId } = await params;
  const { mode } = await searchParams;
  return <SessionView sessionId={sessionId} openedInCorrection={mode === "correction"} />;
}
