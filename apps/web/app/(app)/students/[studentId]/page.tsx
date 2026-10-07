import type { ReactElement } from "react";

import { StudentProfileView } from "../../../../features/students/components/student-profile-view";

export default async function Page({
  params,
}: {
  params: Promise<{ studentId: string }>;
}): Promise<ReactElement> {
  const { studentId } = await params;
  return <StudentProfileView studentId={studentId} />;
}
