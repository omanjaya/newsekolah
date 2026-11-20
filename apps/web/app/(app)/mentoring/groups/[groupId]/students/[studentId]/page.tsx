import type { ReactElement } from "react";

import { RouteGuard } from "../../../../../../../components/route-guard";
import { MentorStudentView } from "../../../../../../../features/mentoring/components/mentor-student-view";
import { MENTOR_PERMISSIONS } from "../../../../../../../features/mentoring/permissions";

export default async function MentorStudentPage({
  params,
}: {
  params: Promise<{ groupId: string; studentId: string }>;
}): Promise<ReactElement> {
  const { groupId, studentId } = await params;
  return (
    <RouteGuard anyPermission={MENTOR_PERMISSIONS}>
      <MentorStudentView groupId={groupId} studentId={studentId} />
    </RouteGuard>
  );
}
