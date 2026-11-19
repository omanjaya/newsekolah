"use client";

import {
  Avatar,
  Button,
  Dialog,
  DialogContent,
  type PageHeaderAction,
  Skeleton,
  TextLink,
} from "@newsekolah/ui";
import { HeartHandshake, Plus, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { RecordNotFoundPage } from "../../../components/record-not-found";
import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryLookup } from "../../reference/directory-names";
import { personRecordStatus } from "../../reference/person-record";
import { studentProfileHref } from "../../students/href";

import { StudentDisciplinePanel } from "./student-discipline-panel";
import { useOpenStudentDisciplineReport } from "./use-open-student-discipline-report";
import { ViolationRecordForm } from "./violation-record-form";

/**
 * The staff-facing detail behind one student's discipline record: who the
 * student is, the actions for them (record a violation, a counseling note,
 * the printable report), then the record itself.
 */
export function StudentDisciplineView({ studentId }: { studentId: string }): ReactElement {
  const t = useTranslations("app.discipline.studentDetail");
  const tViolations = useTranslations("app.discipline.violations");
  const canRecord = useCan("record_violations");
  const canCounsel = useCan("manage_counseling");
  // "Still loading", "failed" and "not found" differ: the name stays a
  // placeholder while loading or after a failed lookup (the description
  // offers a retry), and a student the school does not have (an unknown or
  // malformed id) is the not-found page, with no actions to record against.
  const lookup = useDirectoryLookup([studentId]);
  const student = lookup.names.get(studentId);
  const status = personRecordStatus(lookup, studentId, "student");
  const namePending = !student;
  const studentName = student?.name ?? t("unknownStudent");
  const report = useOpenStudentDisciplineReport();
  const [recording, setRecording] = useState(false);

  if (status === "missing") {
    return (
      <RecordNotFoundPage
        title={t("notFoundTitle")}
        backHref="/discipline/violations"
        backLabel={t("backToViolations")}
      />
    );
  }

  const secondaryActions: PageHeaderAction[] = [
    ...(canCounsel
      ? [
          {
            label: t("recordCounseling"),
            icon: <HeartHandshake />,
            href: `/discipline/counseling?studentId=${encodeURIComponent(studentId)}`,
          },
        ]
      : []),
    {
      label: t("printReport"),
      icon: <Printer />,
      disabled: report.pending,
      onSelect: () => {
        report.open(studentId);
      },
    },
  ];

  return (
    <AppPage
      leading={
        namePending ? (
          <Skeleton className="size-12 rounded-full" />
        ) : (
          <Avatar name={studentName} size={48} decorative />
        )
      }
      title={namePending ? <Skeleton className="h-8 w-48" /> : studentName}
      description={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {student?.nis && <span>{t("nis", { nis: student.nis })}</span>}
          {!student && lookup.isError && (
            <span className="flex items-center gap-2">
              <span>{t("nameLoadError")}</span>
              <Button variant="link" size="sm" onClick={lookup.refetch}>
                {t("retry")}
              </Button>
            </span>
          )}
          <TextLink href={studentProfileHref(studentId)}>{t("openProfile")}</TextLink>
        </span>
      }
      primaryAction={
        canRecord ? (
          <Button
            icon={<Plus />}
            onClick={() => {
              setRecording(true);
            }}
          >
            {tViolations("record")}
          </Button>
        ) : undefined
      }
      secondaryActions={secondaryActions}
    >
      <StudentDisciplinePanel studentId={studentId} />
      <Dialog open={recording} onOpenChange={setRecording}>
        <DialogContent
          title={tViolations("form.title")}
          description={tViolations("form.description")}
          size="lg"
        >
          {recording && (
            <ViolationRecordForm
              initialStudentIds={[studentId]}
              onDone={() => {
                setRecording(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppPage>
  );
}
