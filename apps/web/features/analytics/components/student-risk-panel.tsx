"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDateTime, formatNumber } from "@newsekolah/i18n";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  SkeletonDetail,
} from "@newsekolah/ui";
import { ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { isNotFoundError } from "../../../lib/api/not-found";
import { useModuleEnabled } from "../../../lib/modules/use-module-enabled";
import { useSession } from "../../../lib/session/session-provider";
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
  const { me } = useSession();
  const reasonText = useReasonText();
  const disciplineOn = useModuleEnabled("discipline");
  const gradingOn = useModuleEnabled("grading");
  const { data, isLoading, error, refetch } = useStudentRiskQuery(studentId);

  if (isLoading) return <SkeletonDetail rows={4} />;

  // No stored result for this student this year (not computed yet, or
  // outside the reader's class): an answer, not a failure to retry.
  if (!data && isNotFoundError(error)) {
    return (
      <EmptyState
        icon={<ShieldCheck aria-hidden="true" />}
        title={t("noResultTitle")}
        description={t("noResultBody")}
      />
    );
  }

  if (error || !data) {
    return <QueryError retry={() => refetch()} error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card padding="md">
        <CardHeader action={<RiskLevelBadge level={data.level} label={levelLabel(data.level)} />}>
          <CardTitle as="h2">{t("reasonsTitle")}</CardTitle>
          <CardDescription>
            {t("score", { score: data.score })} ·{" "}
            {t("freshness", {
              // In the school's zone, as the at-risk list states it.
              time: formatDateTime(data.computed_at, { locale, timeZone: me?.tenant.timezone }),
            })}
          </CardDescription>
        </CardHeader>
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
      </Card>

      <Card padding="md">
        <CardHeader>
          <CardTitle as="h2">{t("signalsTitle")}</CardTitle>
        </CardHeader>
        {/* Every signal has one shape: a figure with its unit, and for the
            two ratios a bar under it. */}
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SignalRow label={t("signals.attendance")}>
            {data.signals.has_attendance ? (
              <div className="flex flex-col gap-1.5">
                <SignalFigure
                  value={data.signals.absent_days}
                  unit={t("signals.absentUnit", { considered: data.signals.considered_days })}
                />
                <AttendanceRatioBar
                  absentDays={data.signals.absent_days}
                  consideredDays={data.signals.considered_days}
                />
              </div>
            ) : (
              <p className="text-body-sm text-fg-muted">{t("signals.noData")}</p>
            )}
          </SignalRow>
          {/* A switched-off module's signals are left out (the API already
              scores without them), rather than shown as zeros. */}
          {disciplineOn && (
            <>
              <SignalRow label={t("signals.discipline")}>
                <SignalFigure
                  value={data.signals.discipline_points}
                  unit={t("signals.disciplineUnit")}
                />
              </SignalRow>
              <SignalRow label={t("signals.warningLetters")}>
                <SignalFigure
                  value={data.signals.warning_letter_count}
                  unit={t("signals.warningLettersUnit", {
                    count: data.signals.warning_letter_count,
                  })}
                />
              </SignalRow>
            </>
          )}
          {gradingOn && (
            <SignalRow label={t("signals.gradeTrend")}>
              {data.signals.has_grade_trend ? (
                <div className="flex flex-col gap-1.5">
                  <SignalFigure
                    value={formatNumber(data.signals.current_average, {
                      locale,
                      fractionDigits: 1,
                    })}
                    unit={t("signals.gradeTrendUnit", {
                      previous: formatNumber(data.signals.previous_average, {
                        locale,
                        fractionDigits: 1,
                      }),
                    })}
                  />
                  <GradeTrendBars
                    previous={data.signals.previous_average}
                    current={data.signals.current_average}
                  />
                </div>
              ) : data.signals.scored_subjects > 0 ? (
                // A first term: its average is known, with nothing to
                // compare it with yet.
                <SignalFigure
                  value={formatNumber(data.signals.current_average, {
                    locale,
                    fractionDigits: 1,
                  })}
                  unit={t("signals.gradeTrendNoPrevious")}
                />
              ) : (
                <p className="text-body-sm text-fg-muted">{t("signals.noData")}</p>
              )}
            </SignalRow>
          )}
          {gradingOn && (
            <SignalRow label={t("signals.belowKktp")}>
              {data.signals.scored_subjects > 0 ? (
                <SignalFigure
                  value={data.signals.subjects_below_kktp}
                  unit={t("signals.belowKktpUnit", { scored: data.signals.scored_subjects })}
                />
              ) : (
                <p className="text-body-sm text-fg-muted">{t("signals.noData")}</p>
              )}
            </SignalRow>
          )}
        </dl>
      </Card>
    </div>
  );
}

function SignalRow({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-caption text-fg-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** A signal's figure on the title role, its unit beside it as a caption. */
function SignalFigure({ value, unit }: { value: number | string; unit: string }): ReactElement {
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-title-lg tabular-nums text-fg">{value}</span>
      <span className="text-caption text-fg-muted">{unit}</span>
    </p>
  );
}
