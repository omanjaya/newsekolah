"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Alert, Button, EmptyState, PageHeader, Skeleton } from "@newsekolah/ui";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import { useStudentRiskQuery } from "../api";

import { useReasonText } from "./reason-text";
import { RiskLevelBadge } from "./risk-level-badge";

export interface StudentRiskDetailViewProps {
  studentId: string;
}

/**
 * One student's signals and the reasons behind the level: every number
 * the scorer used, laid out so a homeroom teacher or counselor can see
 * exactly what to bring up, not just a label.
 */
export function StudentRiskDetailView({ studentId }: StudentRiskDetailViewProps): ReactElement {
  const t = useTranslations("app.analytics.detail");
  const levelLabel = useTranslations("app.analytics.level");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const apiErrorMessage = useApiErrorMessage();
  const reasonText = useReasonText();

  const { data, isLoading, error } = useStudentRiskQuery(studentId);
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const studentName = studentMap.get(studentId)?.name ?? t("unknownStudent");

  const backButton = (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        router.back();
      }}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t("back")}
    </Button>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !data) {
    const message =
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN");
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        {backButton}
        <Alert variant="warning" title={message} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {backButton}
      <PageHeader eyebrow={t("eyebrow")} title={studentName} />
      <p className="text-[13px] text-fg-muted">
        {t("freshness", { time: formatDateTime(data.computed_at, { locale }) })}
      </p>

      <div className="flex items-center gap-3">
        <RiskLevelBadge level={data.level} label={levelLabel(data.level)} />
        <span className="text-[13px] text-fg-muted">{t("score", { score: data.score })}</span>
      </div>

      <section className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
        <h2 className="text-[16px] font-medium text-fg">{t("reasonsTitle")}</h2>
        {data.reasons.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck aria-hidden="true" />}
            title={t("noReasonsTitle")}
            description={t("noReasonsBody")}
          />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {data.reasons.map((reason, index) => (
              <li key={`${reason.code}-${index}`} className="text-[13px] text-fg">
                {reasonText(reason)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
        <h2 className="text-[16px] font-medium text-fg">{t("signalsTitle")}</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SignalRow
            label={t("signals.attendance")}
            value={
              data.signals.has_attendance
                ? t("signals.attendanceValue", {
                    absent: data.signals.absent_days,
                    considered: data.signals.considered_days,
                  })
                : t("signals.noData")
            }
          />
          <SignalRow
            label={t("signals.discipline")}
            value={t("signals.disciplineValue", { points: data.signals.discipline_points })}
          />
          <SignalRow
            label={t("signals.warningLetters")}
            value={String(data.signals.warning_letter_count)}
          />
          <SignalRow
            label={t("signals.gradeTrend")}
            value={
              data.signals.has_grade_trend
                ? t("signals.gradeTrendValue", {
                    previous: data.signals.previous_average.toFixed(1),
                    current: data.signals.current_average.toFixed(1),
                  })
                : t("signals.noData")
            }
          />
        </dl>
      </section>
    </div>
  );
}

function SignalRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[12px] text-fg-muted">{label}</dt>
      <dd className="text-[14px] text-fg">{value}</dd>
    </div>
  );
}
