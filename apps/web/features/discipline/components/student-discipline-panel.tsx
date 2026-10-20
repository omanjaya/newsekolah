"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  Skeleton,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { FileText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type ViolationRecord,
  useIssueWarningLetterMutation,
  useStudentDisciplineQuery,
} from "../api";

import { StudentCounselingHistory } from "./student-counseling-history";
import { ViolationAttachments } from "./violation-attachments";

/**
 * The body of one student's discipline record: the same points and
 * letters a counselor sees on the SP-candidates row, plus when each
 * warning-letter level was first crossed. Shared by the staff detail page
 * (`StudentDisciplineView`) and the student profile's discipline tab;
 * `showCounseling` lets the profile, which has a tab of its own for
 * counseling, leave the history out.
 */
export function StudentDisciplinePanel({
  studentId,
  showCounseling = true,
}: {
  studentId: string;
  showCounseling?: boolean;
}): ReactElement {
  const t = useTranslations("app.discipline.studentDetail");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canIssue = useCan("issue_warning_letters");
  const canSeeCounseling = useCan("manage_counseling");
  const canRecordViolations = useCan("record_violations");
  const [viewingRecord, setViewingRecord] = useState<ViolationRecord | null>(null);

  const { data, isLoading, error } = useStudentDisciplineQuery(studentId);
  const issue = useIssueWarningLetterMutation();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return <Alert variant="warning" title={t("loadError")} />;
  }

  const records = data.records.filter((r) => !r.is_voided);
  const nextDue = data.due_levels[0];

  return (
    <div className="flex flex-col gap-6">
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
              <li key={record.id}>
                <button
                  type="button"
                  onClick={() => {
                    setViewingRecord(record);
                  }}
                  className="flex min-h-9 w-full items-center justify-between gap-2 rounded-xs px-1.5 py-1 text-left text-[13px] text-fg hover:bg-bg"
                >
                  <span>
                    {record.type_name}{" "}
                    <span className="text-fg-muted">
                      {formatDate(record.occurred_on, { locale })}
                    </span>
                  </span>
                  <span className="[font-variant-numeric:tabular-nums]">{record.points}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showCounseling && canSeeCounseling && <StudentCounselingHistory studentId={studentId} />}

      <Dialog
        open={viewingRecord != null}
        onOpenChange={(open) => {
          if (!open) setViewingRecord(null);
        }}
      >
        <DialogContent title={viewingRecord?.type_name ?? ""}>
          {viewingRecord && (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-fg-muted">
                {formatDate(viewingRecord.occurred_on, { locale })} ·{" "}
                {t("recordPoints", { points: viewingRecord.points })}
              </p>
              {viewingRecord.notes && <p className="text-[13px] text-fg">{viewingRecord.notes}</p>}
              <ViolationAttachments recordId={viewingRecord.id} canUpload={canRecordViolations} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
