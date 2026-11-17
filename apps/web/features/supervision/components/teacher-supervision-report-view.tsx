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
import {
  ReportExportDialog,
  type ReportExportColumn,
  type ReportExportOptions,
} from "../../../components/report-export-dialog";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import {
  type TeacherSupervisionReport,
  downloadTeacherSupervisionReport,
  useTeacherSupervisionReportQuery,
} from "../api";
import { averageScore, formatScore } from "../lib/score-format";
import { useCycleTrail } from "../lib/use-cycle-trail";

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
  // No completed observation yet: an average of 0,00 would read as a score.
  const hasScores = report.observations.length > 0;
  const span = Math.max(max - min, 1);

  return (
    <>
      <StatGrid variant="tiles" className="grid-cols-1 sm:grid-cols-2">
        <Stat
          icon={<Gauge />}
          tone="green"
          label={t("overallAverage")}
          value={hasScores ? formatScore(report.overall_average, locale) : "–"}
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
            const average = report.criterion_average[criterion.key] ?? 0;
            return (
              <Progress
                key={criterion.key}
                variant="meter"
                label={`${String(index + 1)}. ${criterion.name}`}
                value={hasScores ? average - min : 0}
                max={span}
                valueLabel={hasScores ? formatScore(average, locale) : "–"}
              />
            );
          })}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <SectionHeader title={t("observations")} count={report.observations.length} />
        {report.observations.length === 0 ? (
          <EmptyState
            icon={<domainIcons.supervision />}
            title={t("noObservationsTitle")}
            description={t("noObservations")}
          />
        ) : (
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
        )}
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

  let content: ReactElement;
  if (isError && !data) {
    content = <QueryError retry={() => refetch()} error={error} />;
  } else if (isLoading || !data) {
    content = (
      <div className="flex flex-col gap-6" aria-busy="true">
        <SkeletonCards count={2} className="grid-cols-1 sm:grid-cols-2" />
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

  if (hideHeader) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          {toolbar ?? <span />}
          <Button variant="secondary" icon={<Download />} disabled={!data} onClick={openExport}>
            {t("export")}
          </Button>
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
        data ? [{ label: t("export"), icon: <Download />, onSelect: openExport }] : []
      }
    >
      {content}
      {exportDialog}
    </AppPage>
  );
}
