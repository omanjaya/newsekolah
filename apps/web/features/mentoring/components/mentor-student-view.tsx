"use client";

import { Card, CardHeader, CardTitle, SkeletonDetail } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useMentorGroupQuery, useMentorStudentSnapshotQuery } from "../api";

import { MentorTermSummaryPanel } from "./mentor-term-summary-panel";
import {
  SnapshotAttendanceSection,
  SnapshotDisciplineSection,
  SnapshotGradesSection,
} from "./student-snapshot-sections";

/**
 * The mentor's per-student view: attendance, discipline, and published
 * grades composed from other modules (docs/03-layered-architecture.md:
 * mentoring reads these through the API, never their own tables), plus the
 * mentor's own term summary for the same student. The trail leads back to
 * the group.
 */
export function MentorStudentView({
  groupId,
  studentId,
}: {
  groupId: string;
  studentId: string;
}): ReactElement {
  const t = useTranslations("app.mentoring.studentView");
  const tMentoring = useTranslations("app.mentoring");
  const snapshot = useMentorStudentSnapshotQuery(studentId);
  const group = useMentorGroupQuery(groupId);
  const groupLabel = group.data?.name ?? t("backToGroup");

  if (snapshot.isError && !snapshot.data) {
    return (
      <AppPage>
        <QueryError retry={() => snapshot.refetch()} error={snapshot.error} />
      </AppPage>
    );
  }

  if (snapshot.isLoading || !snapshot.data) {
    return (
      <AppPage>
        <SkeletonDetail rows={6} />
      </AppPage>
    );
  }

  const data = snapshot.data;
  const name = formatDisplayName(data.student_name);

  return (
    <AppPage
      title={name}
      description={data.class_name}
      breadcrumb={[
        { label: tMentoring("navLabelGroups"), href: "/mentoring/groups" },
        { label: groupLabel, href: `/mentoring/groups/${groupId}` },
        { label: name },
      ]}
    >
      {/* Three short read-outs side by side once there is room, each card
          stretched to the row height; the summary the mentor writes spans below. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SnapshotAttendanceSection snapshot={data} />
        <SnapshotDisciplineSection snapshot={data} />
        <SnapshotGradesSection snapshot={data} />
      </div>

      <Card padding="md">
        <CardHeader>
          <CardTitle as="h2">{t("termSummary.title")}</CardTitle>
        </CardHeader>
        <MentorTermSummaryPanel groupId={groupId} studentId={studentId} />
      </Card>
    </AppPage>
  );
}
