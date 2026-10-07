"use client";

import { Button, PageHeader, Skeleton } from "@newsekolah/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useMentorStudentSnapshotQuery } from "../api";

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
 * mentor's own term summary for the same student.
 */
export function MentorStudentView({
  groupId,
  studentId,
}: {
  groupId: string;
  studentId: string;
}): ReactElement {
  const t = useTranslations("app.mentoring.studentView");
  const snapshot = useMentorStudentSnapshotQuery(studentId);

  if (snapshot.isError && !snapshot.data)
    return <QueryError retry={() => snapshot.refetch()} className="m-4" />;

  if (snapshot.isLoading || !snapshot.data) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-9 w-32" />
        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-20 w-full max-w-sm" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    );
  }

  const data = snapshot.data;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <Button asChild variant="secondary" size="sm" className="self-start">
        <Link href={`/mentoring/groups/${groupId}`}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("backToGroup")}
        </Link>
      </Button>

      <div className="flex flex-col gap-1">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={formatDisplayName(data.student_name)}
          className="border-b-0 pb-0"
        />
        <p className="text-[13px] text-fg-muted">{data.class_name}</p>
      </div>

      <SnapshotAttendanceSection snapshot={data} />
      <SnapshotDisciplineSection snapshot={data} />
      <SnapshotGradesSection snapshot={data} />

      <section className="flex flex-col gap-3 border-t border-border pt-4">
        <h2 className="text-[16px] font-medium text-fg">{t("termSummary.title")}</h2>
        <MentorTermSummaryPanel groupId={groupId} studentId={studentId} />
      </section>
    </div>
  );
}
