"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  List,
  ListRow,
  Progress,
  SectionHeader,
  SkeletonCards,
  SkeletonList,
  Stat,
  StatGrid,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { ClipboardCheck, Download, Gauge } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { RecordNotFoundPage } from "../../../components/record-not-found";
import {
  ReportExportDialog,
  type ReportExportColumn,
  type ReportExportOptions,
} from "../../../components/report-export-dialog";
import { isNotFoundError } from "../../../lib/api/not-found";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import {
  type TeacherSupervisionReport,
  downloadTeacherSupervisionReport,
  useSupervisionCycleQuery,
  useTeacherSupervisionReportQuery,
} from "../api";
import { averageScore, formatScore } from "../lib/score-format";
import { cycleHref, useCycleTrail } from "../lib/use-cycle-trail";

import { CycleNotFoundPage } from "./cycle-not-found";

/** Whether a not-found report read failed on the cycle rather than the teacher. */
function cycleIsMissing(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.code === "SUPERVISION_CYCLE_NOT_FOUND") return true;
  return (error.details ?? []).some((detail) => detail.field === "cycleId");
}

/**
 * Whether a not-found report read says nothing about the cycle: the API
 * rejects a malformed teacher id (a 400) before it looks the cycle up, so a
 * well-formed but unknown cycle id passes unnoticed there. A 404 for the
 * teacher comes after the cycle was found.
 */
function cycleUnchecked(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400 && !cycleIsMissing(error);
}

/**
 * The figures of one report: the overall average against the scale, each
 * criterion's average as a meter, then every observation with its own
 * average and whether the teacher has responded. It reports the recorded
 * numbers only and never characterizes the teacher.
 */
function ReportContent({ report }: { report: TeacherSupervisionReport }): ReactElement {
  const t = useTranslations("app.supervision.teacherReport");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const { scale_min: min, scale_max: max, criteria } = report.cycle.instrument;
  const span = Math.max(max - min, 1);

  // No completed observation yet: there is nothing to average, so the page
  // says so once instead of showing dashes and empty meters.
  if (report.observations.length === 0) {
    return (
      <EmptyState
        icon={<domainIcons.supervision />}
        title={t("noObservationsTitle")}
        description={t("noObservations")}
      />
    );
  }

  return (
    <>
      <StatGrid variant="tiles" className="sm:grid-cols-2">
        <Stat
          icon={<Gauge />}
          tone="green"
          label={t("overallAverage")}
          value={formatScore(report.overall_average, locale)}
          hint={t("ofScale", { min, max })}
        />
        <Stat
          icon={<ClipboardCheck />}
          tone="blue"
          label={t("completed")}
          value={report.observations.length}
        />
      </StatGrid>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("byCriterion")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {criteria.map((criterion, index) => {
            const average = report.criterion_average[criterion.key];
            return (
              // The criterion's number in a muted column of its own, as on
              // the cycle's instrument and on an observation's scores.
              <div key={criterion.key} className="flex items-start gap-3">
                <span className="w-5 shrink-0 text-right text-label text-fg-muted tabular-nums">
                  {index + 1}
                </span>
                <Progress
                  className="min-w-0 flex-1"
                  variant="meter"
                  label={criterion.name}
                  value={average === undefined ? 0 : average - min}
                  max={span}
                  valueLabel={average === undefined ? "–" : formatScore(average, locale)}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <SectionHeader title={t("observations")} count={report.observations.length} />
        <List framed aria-label={t("observations")}>
          {report.observations.map((observation) => {
            const average = averageScore(observation.scores);
            return (
              <ListRow
                key={observation.id}
                title={formatDate(observation.observed_at, {
                  locale,
                  timeZone: me?.tenant.timezone,
                })}
                meta={[
                  average === null
                    ? undefined
                    : t("observationAverage", { average: formatScore(average, locale) }),
                  observation.teacher_response ? t("responded") : t("notResponded"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                href={`/supervision/observations/${observation.id}`}
              />
            );
          })}
        </List>
      </section>
    </>
  );
}

/**
 * One teacher's observations within one cycle, exportable. On its own
 * route it is a page of the cycle's results; embedded in "Supervisi saya"
 * (`hideHeader`) it is just the content, with the host's cycle picker as
 * `toolbar` beside the export.
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
  const trail = useCycleTrail();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const { data, isLoading, isError, error, refetch } = useTeacherSupervisionReportQuery(
    cycleId,
    teacherId,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const notFound = !hideHeader && isError && !data && isNotFoundError(error);
  // The teacher's not-found page leads back to the cycle's results, so the
  // cycle must exist first: when the report read never looked at it, the
  // cycle itself is read before either page is chosen.
  const checkCycle = notFound && cycleUnchecked(error);
  const cycleCheck = useSupervisionCycleQuery(cycleId, checkCycle);
  const cycleChecking = checkCycle && cycleCheck.isPending;
  const cycleMissing =
    cycleIsMissing(error) ||
    (checkCycle && cycleCheck.isError && isNotFoundError(cycleCheck.error));

  // On its own route, an unknown or malformed id is a missing record, not a
  // failure to retry: the cycle's not-found page when the cycle is what is
  // missing, otherwise this teacher's, leading back to the cycle's results.
  if (notFound && !cycleChecking) {
    return cycleMissing ? (
      <CycleNotFoundPage />
    ) : (
      <RecordNotFoundPage
        title={t("notFoundTitle")}
        backHref={`${cycleHref(cycleId)}/report`}
        backLabel={t("backToResults")}
      />
    );
  }

  let content: ReactElement;
  if (isError && !data && !cycleChecking) {
    content = <QueryError retry={() => refetch()} error={error} />;
  } else if (isLoading || !data) {
    content = (
      <div className="flex flex-col gap-6" aria-busy="true">
        <SkeletonCards count={2} className="sm:grid-cols-2" />
        <SkeletonList rows={4} leading={false} />
      </div>
    );
  } else {
    content = <ReportContent report={data} />;
  }

  // Must match supervision/service/report.go's teacherReportColumns keys
  // and order exactly: the observation date, one column per instrument
  // criterion (in the instrument's own order, labelled with the
  // criterion's own name -- not translated, it is the tenant's own
  // vocabulary), then the average and the three free-text fields.
  const columns: ReportExportColumn[] = [
    { key: "date", label: t("columns.date") },
    ...(data?.cycle.instrument.criteria ?? []).map((c) => ({
      key: `criterion_${c.key}`,
      label: c.name,
    })),
    { key: "average", label: t("columns.average") },
    { key: "observer_notes", label: t("columns.observer_notes") },
    { key: "teacher_response", label: t("columns.teacher_response") },
    { key: "agreed_follow_up", label: t("columns.agreed_follow_up") },
  ];

  async function handleExport(options: ReportExportOptions) {
    if (!data) return;
    try {
      await downloadTeacherSupervisionReport(
        cycleId,
        teacherId,
        `${data.teacher_name}-${data.cycle.name}`,
        options,
      );
    } catch (exportError) {
      if (exportError instanceof ApiError) toast.error(apiErrorMessage(exportError.code));
      throw exportError;
    }
  }

  const exportDialog = (
    <ReportExportDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      reportKey="supervision.teacher-report"
      defaultTitle={t("defaultTitle")}
      availableColumns={columns}
      onExport={handleExport}
    />
  );
  const openExport = () => {
    setDialogOpen(true);
  };
  // A report without a completed observation has no rows to export. While
  // it loads the button stays in place (disabled) so the row does not jump.
  const hasObservations = data !== undefined && data.observations.length > 0;
  const showExport = data === undefined || hasObservations;

  if (hideHeader) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          {toolbar ?? <span />}
          {showExport && (
            <Button
              variant="secondary"
              icon={<Download />}
              disabled={!hasObservations}
              onClick={openExport}
            >
              {t("export")}
            </Button>
          )}
        </div>
        {content}
        {exportDialog}
      </div>
    );
  }

  return (
    <AppPage
      title={data?.teacher_name}
      // One teacher's page below the cycle's results: the trail says where
      // it sits, so it carries none of the cycle's own tabs.
      breadcrumb={trail.within(cycleId, data?.cycle.name, trail.results(cycleId))}
      nav={false}
      secondaryActions={
        hasObservations ? [{ label: t("export"), icon: <Download />, onSelect: openExport }] : []
      }
    >
      {content}
      {exportDialog}
    </AppPage>
  );
}
