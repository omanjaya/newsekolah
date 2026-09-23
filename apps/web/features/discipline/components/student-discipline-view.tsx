"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { FileText, Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import {
  useIssueWarningLetterMutation,
  useStudentDisciplineQuery,
  useStudentDisciplineReportMutation,
} from "../api";

import { StudentCounselingHistory } from "./student-counseling-history";

/**
 * The staff-facing detail behind one student's discipline record: the same
 * points and letters a counselor sees on the SP-candidates row, plus when
 * each warning-letter level was first crossed and the printable PDF report
 * (reachable only from here, per the module brief).
 */
export function StudentDisciplineView({ studentId }: { studentId: string }): ReactElement {
  const t = useTranslations("app.discipline.studentDetail");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canIssue = useCan("issue_warning_letters");
  const canSeeCounseling = useCan("manage_counseling");

  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const { data, isLoading, error } = useStudentDisciplineQuery(studentId);
  const report = useStudentDisciplineReportMutation();
  const issue = useIssueWarningLetterMutation();

  const studentName = studentMap.get(studentId)?.name ?? t("unknownStudent");

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return <Alert variant="warning" title={t("loadError")} className="m-6" />;
  }

  const records = data.records.filter((r) => !r.is_voided);
  const nextDue = data.due_levels[0];

  function downloadReport() {
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
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={studentName}
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<Printer />}
            loading={report.isPending}
            onClick={downloadReport}
          >
            {t("printReport")}
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
          <h2 className="text-[16px] font-medium text-fg">{t("recap")}</h2>
          <p className="text-[13px] text-fg-muted">
            {t("totalPoints", { points: data.total_points })}
          </p>
          <ul className="flex flex-col gap-1.5">
            {data.policy.levels.map((level) => {
              const crossing = data.first_crossed.find((c) => c.level === level.level);
              return (
                <li
                  key={level.level}
                  className="flex items-center justify-between gap-2 text-[13px]"
                >
                  <span className="text-fg">
                    {level.label}
                    <span className="ml-1.5 text-fg-muted">
                      {t("thresholdPoints", { points: level.min_points })}
                    </span>
                  </span>
                  {crossing ? (
                    <span className="text-fg-muted">
                      {t("crossedOn", { date: formatDate(crossing.occurred_on, { locale }) })}
                    </span>
                  ) : (
                    <Badge variant="neutral">{t("notCrossed")}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
          {canIssue && nextDue && (
            <Button
              size="sm"
              className="self-start"
              loading={issue.isPending}
              onClick={() => {
                issue.mutate(
                  { student_user_id: studentId, level: nextDue.level },
                  {
                    onSuccess: () => {
                      toast.success(t("issued", { level: nextDue.label }));
                    },
                    onError: (err) => {
                      toast.error(
                        err instanceof ApiError
                          ? apiErrorMessage(err.code)
                          : apiErrorMessage("UNKNOWN"),
                      );
                    },
                  },
                );
              }}
            >
              {t("issue", { level: nextDue.label })}
            </Button>
          )}
        </section>

        <section className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
          <h2 className="text-[16px] font-medium text-fg">{t("letters")}</h2>
          {data.letters.length === 0 ? (
            <p className="text-[13px] text-fg-muted">{t("lettersEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.letters.map((letter) => (
                <li key={letter.id} className="flex items-center gap-2 text-[13px] text-fg">
                  <FileText className="size-4 text-fg-muted" aria-hidden="true" />
                  {letter.letter_number} · {letter.level_label} · {letter.issued_at.slice(0, 10)}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
        <h2 className="text-[16px] font-medium text-fg">{t("records")}</h2>
        {records.length === 0 ? (
          <EmptyState
            icon={<domainIcons.violation aria-hidden="true" />}
            title={t("recordsEmptyTitle")}
            description={t("recordsEmptyBody")}
          />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {records.map((record) => (
              <li
                key={record.id}
                className="flex items-center justify-between gap-2 text-[13px] text-fg"
              >
                <span>
                  {record.type_name}{" "}
                  <span className="text-fg-muted">
                    {formatDate(record.occurred_on, { locale })}
                  </span>
                </span>
                <span className="[font-variant-numeric:tabular-nums]">{record.points}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canSeeCounseling && <StudentCounselingHistory studentId={studentId} />}
    </div>
  );
}
