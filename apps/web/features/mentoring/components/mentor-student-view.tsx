"use client";

import { Card, CardHeader, CardTitle, SkeletonDetail } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { RecordForbiddenPage, RecordNotFoundPage } from "../../../components/record-not-found";
import { isForbiddenError, isNotFoundError } from "../../../lib/api/not-found";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useMentorGroupQuery, useMentorStudentSnapshotQuery } from "../api";
import { useMentorGroupsHref } from "../permissions";

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
  const tGroup = useTranslations("app.mentoring.groupDetail");
  const snapshot = useMentorStudentSnapshotQuery(studentId);
  const group = useMentorGroupQuery(groupId);
  const groupsHref = useMentorGroupsHref();
  const groupLabel = group.data?.name ?? t("backToGroup");

  // An unknown or malformed id is a missing record, not a failure to
  // retry: the group's not-found page when the group is what is missing
  // (back to the group list), otherwise the student's (back to the group).
  if (group.isError && !group.data && isNotFoundError(group.error)) {
    return (
      <RecordNotFoundPage
        title={tGroup("notFoundTitle")}
        backHref={groupsHref}
        backLabel={tGroup("backToGroups")}
      />
    );
  }
  // A group another guru wali mentors, or a student outside the reader's
  // groups: the no-access page, since a retry is refused again.
  if (group.isError && !group.data && isForbiddenError(group.error)) {
    return (
      <RecordForbiddenPage
        error={group.error}
        backHref={groupsHref}
        backLabel={tGroup("backToGroups")}
      />
    );
  }
  // Both requests fail for a malformed link in parallel. A failed snapshot
  // waits for the group's answer (the skeleton below), which may still
  // turn out to be the group's not-found page, so neither the student's
  // page nor a retry flashes on the way there.
  const snapshotFailed = snapshot.isError && !snapshot.data;
  if (snapshotFailed && !group.isPending && isNotFoundError(snapshot.error)) {
    return (
      <RecordNotFoundPage
        title={t("notFoundTitle")}
        backHref={`/mentoring/groups/${groupId}`}
        backLabel={t("backToGroup")}
      />
    );
  }

  if (snapshotFailed && !group.isPending && isForbiddenError(snapshot.error)) {
    return (
      <RecordForbiddenPage
        error={snapshot.error}
        backHref={groupsHref}
        backLabel={tGroup("backToGroups")}
      />
    );
  }

  if (snapshotFailed && !group.isPending) {
    return (
      <AppPage>
        <QueryError retry={() => snapshot.refetch()} error={snapshot.error} />
      </AppPage>
    );
  }

  if (snapshotFailed || snapshot.isLoading || !snapshot.data) {
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
        { label: tMentoring("navLabelGroups"), href: groupsHref },
        { label: groupLabel, href: `/mentoring/groups/${groupId}` },
        { label: name },
      ]}
    >
      {/* Three short read-outs side by side once there is room, each card
          stretched to the row height; the summary the mentor writes spans below. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
