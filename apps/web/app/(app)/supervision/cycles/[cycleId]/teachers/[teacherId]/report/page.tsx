import type { ReactElement } from "react";

import { RouteGuard } from "../../../../../../../../components/route-guard";
import { TeacherSupervisionReportView } from "../../../../../../../../features/supervision/components/teacher-supervision-report-view";

export default async function TeacherSupervisionReportPage({
  params,
}: {
  params: Promise<{ cycleId: string; teacherId: string }>;
}): Promise<ReactElement> {
  const { cycleId, teacherId } = await params;
  return (
    <RouteGuard requiredPermission="view_supervision">
      <TeacherSupervisionReportView cycleId={cycleId} teacherId={teacherId} />
    </RouteGuard>
  );
}
