"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Alert, EmptyState, Skeleton } from "@newsekolah/ui";
import { ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useStudentRiskQuery } from "../api";

import { AttendanceRatioBar } from "./attendance-ratio-bar";
import { GradeTrendBars } from "./grade-trend-bars";
import { useReasonText } from "./reason-text";
import { RiskLevelBadge } from "./risk-level-badge";
import { RiskReasonsChart } from "./risk-reasons-chart";

/**
 * One student's signals and the reasons behind the risk level: every
 * number the scorer used. Shared by the early-warning detail page and the
 * student profile's summary tab.
 */
export function StudentRiskPanel({ studentId }: { studentId: string }): ReactElement {
  const t = useTranslations("app.analytics.detail");
  const levelLabel = useTranslations("app.analytics.level");
  const locale = useLocale() as Locale;
  const apiErrorMessage = useApiErrorMessage();
  const reasonText = useReasonText();
  const { data, isLoading, error } = useStudentRiskQuery(studentId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !data) {
    const message =
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN");
    return <Alert variant="warning" title={message} />;
  }

  return (
    <div className="flex flex-col gap-6">
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
          <RiskReasonsChart
            reasons={data.reasons}
            reasonText={reasonText}
            severityLabel={(atRisk) => levelLabel(atRisk ? "at_risk" : "watch")}
          />
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
        <h2 className="text-[16px] font-medium text-fg">{t("signalsTitle")}</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SignalRow label={t("signals.attendance")}>
            {data.signals.has_attendance ? (
              <AttendanceRatioBar
                absentDays={data.signals.absent_days}
                consideredDays={data.signals.considered_days}
              />
            ) : (
              <p className="text-[13px] text-fg-muted">{t("signals.noData")}</p>
            )}
          </SignalRow>
          <SignalRow label={t("signals.discipline")}>
            <p className="text-[20px] font-medium text-fg">
              {t("signals.disciplineValue", { points: data.signals.discipline_points })}
            </p>
          </SignalRow>
          <SignalRow label={t("signals.warningLetters")}>
            <p className="text-[20px] font-medium text-fg">{data.signals.warning_letter_count}</p>
          </SignalRow>
          <SignalRow label={t("signals.gradeTrend")}>
            {data.signals.has_grade_trend ? (
              <GradeTrendBars
                previous={data.signals.previous_average}
                current={data.signals.current_average}
              />
            ) : (
              <p className="text-[13px] text-fg-muted">{t("signals.noData")}</p>
            )}
          </SignalRow>
        </dl>
      </section>
    </div>
  );
}

function SignalRow({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[12px] text-fg-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
