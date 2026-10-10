"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, PageHeader, useToast } from "@newsekolah/ui";
import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import { DisciplineWorkspaceNav } from "../../student-services/components/service-workspace-nav";
import { useStudentDisciplineReportMutation } from "../api";

import { StudentDisciplinePanel } from "./student-discipline-panel";

/**
 * Opens the printable discipline PDF for one student (reachable only from
 * a student's detail, per the module brief). Shared by this page's header
 * and the student profile header.
 */
export function StudentDisciplineReportButton({ studentId }: { studentId: string }): ReactElement {
  const t = useTranslations("app.discipline.studentDetail");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const report = useStudentDisciplineReportMutation();

  return (
    <Button
      variant="secondary"
      size="sm"
      icon={<Printer />}
      loading={report.isPending}
      onClick={() => {
        report.mutate(studentId, {
          onSuccess: (result) => {
            window.open(result.url, "_blank", "noopener,noreferrer");
          },
          onError: (err) => {
            toast.error(
              err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
            );
          },
        });
      }}
    >
      {t("printReport")}
    </Button>
  );
}

/** The staff-facing detail behind one student's discipline record. */
export function StudentDisciplineView({ studentId }: { studentId: string }): ReactElement {
  const t = useTranslations("app.discipline.studentDetail");
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const studentName = studentMap.get(studentId)?.name ?? t("unknownStudent");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <DisciplineWorkspaceNav />
      <PageHeader
        eyebrow={t("eyebrow")}
        title={studentName}
        actions={<StudentDisciplineReportButton studentId={studentId} />}
      />
      <StudentDisciplinePanel studentId={studentId} />
    </div>
  );
}
