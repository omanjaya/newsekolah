import type { ReactElement } from "react";

import { StudentDisciplineView } from "../../../../../features/discipline/components/student-discipline-view";

export default async function Page({
  params,
}: {
  params: Promise<{ studentId: string }>;
}): Promise<ReactElement> {
  const { studentId } = await params;
  return <StudentDisciplineView studentId={studentId} />;
}
