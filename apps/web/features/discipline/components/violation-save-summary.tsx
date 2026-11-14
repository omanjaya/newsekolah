"use client";

import { ApiError } from "@newsekolah/api-client";
import { Alert, Button, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type SPLevel, useIssueWarningLetterMutation } from "../api";

/** Shown after a batch of records lands, with the student's new total and any due levels. */
export interface SaveSummary {
  studentId: string;
  studentName: string;
  totalPoints: number;
  dueLevels: SPLevel[];
}

/**
 * What the last save did, per student: the new total and, where a warning
 * letter became due, the button to issue it right away.
 */
export function ViolationSaveSummary({
  summaries,
  onIssued,
  onDismiss,
}: {
  summaries: SaveSummary[];
  onIssued: (studentId: string) => void;
  onDismiss: () => void;
}): ReactElement {
  const t = useTranslations("app.discipline.violations");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const issueLetter = useIssueWarningLetterMutation();

  return (
    <Alert
      variant={summaries.some((s) => s.dueLevels.length > 0) ? "warning" : "success"}
      title={
        summaries.length === 1
          ? t("saveSummaryTitle", {
              student: summaries[0]?.studentName ?? "",
              points: summaries[0]?.totalPoints ?? 0,
            })
          : t("saveSummaryTitleMulti", { count: summaries.length })
      }
      onDismiss={onDismiss}
      dismissLabel={t("dismiss")}
    >
      <div className="flex flex-col gap-3">
        {summaries.map((summary) => {
          const nextDue = summary.dueLevels[0];
          return (
            <div
              key={summary.studentId}
              className="flex flex-col gap-1 border-b border-line pb-2 last:border-0 last:pb-0"
            >
              {summaries.length > 1 && (
                <p className="text-label">
                  {t("saveSummaryStudentPoints", {
                    student: summary.studentName,
                    points: summary.totalPoints,
                  })}
                </p>
              )}
              {nextDue && (
                <p>
                  {t("dueLevelBody", {
                    student: summary.studentName,
                    level: nextDue.label,
                    points: nextDue.min_points,
                  })}
                </p>
              )}
              {summary.dueLevels.length > 1 && (
                <p>
                  {t("dueLevelMore", {
                    levels: summary.dueLevels
                      .slice(1)
                      .map((l) => l.label)
                      .join(", "),
                  })}
                </p>
              )}
              {nextDue && (
                <div>
                  <Button
                    size="sm"
                    loading={issueLetter.isPending}
                    onClick={() => {
                      issueLetter.mutate(
                        { student_user_id: summary.studentId, level: nextDue.level },
                        {
                          onSuccess: () => {
                            toast.success(t("issueNow"));
                            onIssued(summary.studentId);
                          },
                          onError: (error) => {
                            toast.error(
                              error instanceof ApiError
                                ? apiErrorMessage(error.code)
                                : apiErrorMessage("UNKNOWN"),
                            );
                          },
                        },
                      );
                    }}
                  >
                    {t("issueNow")}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Alert>
  );
}
