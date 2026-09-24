"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Button, PageHeader, Skeleton, cn, useToast } from "@newsekolah/ui";
import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import {
  ReportExportDialog,
  type ReportExportColumn,
  type ReportExportOptions,
} from "../../../components/report-export-dialog";
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
  toolbar,
}: {
  cycleId: string;
  teacherId: string;
  /** Set by an embedding page (e.g. "my report") that already shows its own title. */
  hideHeader?: boolean;
  /** With `hideHeader`, shown on the export button's row (e.g. a cycle picker). */
  toolbar?: ReactNode;
}): ReactElement {
  const t = useTranslations("app.supervision.teacherReport");
  const tRoot = useTranslations("app.supervision");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const { data, isLoading, isError, refetch } = useTeacherSupervisionReportQuery(
    cycleId,
    teacherId,
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  // Embedded under another page's header, the host already pads the page.
  const shell = cn("flex flex-col gap-6", !hideHeader && "p-4 md:p-6");

  if (isError && !data) {
    return <QueryError retry={() => refetch()} className={hideHeader ? undefined : "m-4"} />;
  }

  if (isLoading || !data) {
    return (
      <div className={shell} aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const report = data;

  // Must match supervision/service/report.go's teacherReportColumns keys
  // and order exactly: the observation date, one column per instrument
  // criterion (in the instrument's own order, labelled with the
  // criterion's own name -- not translated, it is the tenant's own
  // vocabulary), then the average and the three free-text fields.
  const columns: ReportExportColumn[] = [
    { key: "date", label: t("columns.date") },
    ...report.cycle.instrument.criteria.map((c) => ({ key: `criterion_${c.key}`, label: c.name })),
    { key: "average", label: t("columns.average") },
    { key: "observer_notes", label: t("columns.observer_notes") },
    { key: "teacher_response", label: t("columns.teacher_response") },
    { key: "agreed_follow_up", label: t("columns.agreed_follow_up") },
  ];

  async function handleExport(options: ReportExportOptions) {
    try {
      await downloadTeacherSupervisionReport(
        cycleId,
        teacherId,
        `${report.teacher_name}-${report.cycle.name}`,
        options,
      );
    } catch (error) {
      if (error instanceof ApiError) toast.error(apiErrorMessage(error.code));
      throw error;
    }
  }

  // No completed observation yet: an average of 0.00 would read as a score.
  const hasScores = data.observations.length > 0;

  const exportButton = (
    <Button
      size="sm"
      variant="secondary"
      icon={<Download />}
      onClick={() => {
        setDialogOpen(true);
      }}
    >
      {t("export")}
    </Button>
  );

  return (
    <div className={shell}>
      {hideHeader ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          {toolbar ?? <span />}
          {exportButton}
        </div>
      ) : (
        <PageHeader
          breadcrumb={[
            { label: tRoot("navLabelCycles"), href: "/supervision/cycles" },
            { label: data.cycle.name, href: `/supervision/cycles/${cycleId}` },
            {
              label: tRoot("cycleReport.breadcrumb"),
              href: `/supervision/cycles/${cycleId}/report`,
            },
          ]}
          title={data.teacher_name}
          actions={exportButton}
        />
      )}

      <ReportExportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        reportKey="supervision.teacher-report"
        defaultTitle={t("defaultTitle")}
        availableColumns={columns}
        onExport={handleExport}
      />

      <div className="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <section className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
          <h2 className="text-[13px] font-medium text-fg-muted">{t("overallAverage")}</h2>
          <p className="text-[28px] font-medium tabular-nums">
            {hasScores ? data.overall_average.toFixed(2) : "-"}
          </p>
        </section>

        <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
          <h2 className="text-[13px] font-medium text-fg-muted">{t("byCriterion")}</h2>
          <ul className="flex flex-col gap-2 text-[13px]">
            {data.cycle.instrument.criteria.map((c) => (
              <li key={c.key} className="flex justify-between gap-3">
                <span>{c.name}</span>
                <span className="shrink-0 font-medium tabular-nums">
                  {hasScores ? (data.criterion_average[c.key] ?? 0).toFixed(2) : "-"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[16px] font-medium">{t("observations")}</h2>
        {data.observations.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("noObservations")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-sm border border-border bg-surface">
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
