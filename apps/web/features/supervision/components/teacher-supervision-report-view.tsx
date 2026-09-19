"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Button, PageHeader, Skeleton, useToast } from "@newsekolah/ui";
import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { downloadTeacherSupervisionReport, useTeacherSupervisionReportQuery } from "../api";

/**
 * One teacher's observations within one cycle: overall and per-criterion
 * averages, then every observation's date and score for the reader to
 * judge for themselves — this screen never characterizes the teacher, only
 * reports the recorded numbers (see the task's neutrality requirement).
 */
export function TeacherSupervisionReportView({
  cycleId,
  teacherId,
  hideHeader = false,
}: {
  cycleId: string;
  teacherId: string;
  /** Set by an embedding page (e.g. "my report") that already shows its own title. */
  hideHeader?: boolean;
}): ReactElement {
  const t = useTranslations("app.supervision.teacherReport");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const { data, isLoading, isError, refetch } = useTeacherSupervisionReportQuery(
    cycleId,
    teacherId,
  );
  const [downloading, setDownloading] = useState(false);

  if (isError && !data) return <QueryError retry={() => refetch()} className="m-4" />;

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const report = data;

  async function handleExport() {
    setDownloading(true);
    try {
      await downloadTeacherSupervisionReport(
        cycleId,
        teacherId,
        `${report.teacher_name}-${report.cycle.name}.xlsx`,
      );
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setDownloading(false);
    }
  }

  const exportButton = (
    <Button
      size="sm"
      variant="secondary"
      icon={<Download />}
      loading={downloading}
      onClick={() => {
        void handleExport();
      }}
    >
      {t("export")}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {hideHeader ? (
        <div className="flex justify-end">{exportButton}</div>
      ) : (
        <PageHeader
          eyebrow={t("eyebrow", { cycle: data.cycle.name })}
          title={data.teacher_name}
          actions={exportButton}
        />
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-[16px] font-medium">{t("overallAverage")}</h2>
        <p className="text-[24px] font-medium tabular-nums">{data.overall_average.toFixed(2)}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[16px] font-medium">{t("byCriterion")}</h2>
        <ul className="flex max-w-sm flex-col gap-1 text-[13px]">
          {data.cycle.instrument.criteria.map((c) => (
            <li key={c.key} className="flex justify-between gap-2">
              <span className="text-fg-muted">{c.name}</span>
              <span className="tabular-nums">
                {(data.criterion_average[c.key] ?? 0).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[16px] font-medium">{t("observations")}</h2>
        {data.observations.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("noObservations")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-sm border border-border">
            {data.observations.map((observation) => (
              <li key={observation.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] hover:bg-bg md:min-h-9"
                  onClick={() => {
                    router.push(`/supervision/observations/${observation.id}`);
                  }}
                >
                  <span>{formatDate(observation.observed_at, { locale })}</span>
                  <span className="tabular-nums text-fg-muted">
                    {t("scoreCount", { count: observation.scores.length })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
