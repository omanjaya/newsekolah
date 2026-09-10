import type { ReactElement } from "react";

import { StudentRiskDetailView } from "../../../../features/analytics/components/student-risk-detail-view";

export default async function Page({
  params,
}: {
  params: Promise<{ studentId: string }>;
}): Promise<ReactElement> {
  const { studentId } = await params;
  return <StudentRiskDetailView studentId={studentId} />;
}
