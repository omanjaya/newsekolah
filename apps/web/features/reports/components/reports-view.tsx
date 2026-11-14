"use client";

import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  IconCircle,
  SkeletonCards,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  domainIcons,
  type CategoryTone,
} from "@newsekolah/ui";
import { ChevronUp, Download, FileSpreadsheet, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";
import { useReportsQuery } from "../api";

import { ReportArgsForm } from "./report-args-form";
import { SchedulesView } from "./schedules-view";

/** A report's topic, read off the first part of its kind ("attendance.daily"). */
const DOMAIN: Record<string, { icon: LucideIcon; tone: CategoryTone }> = {
  attendance: { icon: domainIcons.attendance, tone: "green" },
  discipline: { icon: domainIcons.violation, tone: "red" },
  grading: { icon: domainIcons.grades, tone: "blue" },
  permits: { icon: domainIcons.exitPermit, tone: "amber" },
};
const FALLBACK_DOMAIN = { icon: domainIcons.document, tone: "purple" as const };

/**
 * Report centre: one catalogue of exports, filtered server-side to what the
 * caller may run, as cards with the report's topic icon. Picking one opens
 * its argument controls in the card rather than routing to a separate
 * page, since most reports need only one or two inputs before the download
 * is ready. `sectionNav` is the strip of report sections (school, library,
 * visitors) when the reader has more than one.
 */
export function ReportsView({
  tabKey = "tab",
  sectionNav,
}: {
  tabKey?: string;
  sectionNav?: ReactNode;
} = {}): ReactElement {
  const t = useTranslations("app.reports");
  const canManageSchedules = useCan("manage_report_schedules");

  return (
    <AppPage nav={sectionNav ?? false} description={t("description")}>
      {canManageSchedules ? <ReportsTabs tabKey={tabKey} /> : <ExportsTab />}
    </AppPage>
  );
}

function ReportsTabs({ tabKey }: { tabKey: string }): ReactElement {
  const t = useTranslations("app.reports");
  const [tab, setTab] = useUrlState<string>(tabKey, ["exports", "schedules"], "exports");

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-5">
      <TabsList aria-label={t("tabsLabel")}>
        <TabsTrigger value="exports">{t("tabs.exports")}</TabsTrigger>
        <TabsTrigger value="schedules">{t("tabs.schedules")}</TabsTrigger>
      </TabsList>
      <TabsContent value="exports">
        <ExportsTab />
      </TabsContent>
      <TabsContent value="schedules">
        <SchedulesView />
      </TabsContent>
    </Tabs>
  );
}

function ExportsTab(): ReactElement {
  const t = useTranslations("app.reports");
  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  const reports = useReportsQuery();

  const items = reports.data?.data ?? [];

  if (reports.isLoading) {
    return <SkeletonCards count={4} className="sm:grid-cols-2" />;
  }
  if (reports.isError) {
    return <QueryError retry={reports.refetch} error={reports.error} />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<FileSpreadsheet aria-hidden="true" />}
        title={t("emptyTitle")}
        description={t("emptyBody")}
      />
    );
  }

  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {items.map((report) => {
        const isSelected = selectedKind === report.kind;
        // Report kinds are dotted slugs ("attendance.daily"), but a
        // next-intl key cannot contain a dot: it is the namespace
        // separator. The catalog uses underscores instead.
        const kindKey = report.kind.replaceAll(".", "_");
        const label = t.has(`kinds.${kindKey}.label`) ? t(`kinds.${kindKey}.label`) : report.kind;
        const description = t.has(`kinds.${kindKey}.description`)
          ? t(`kinds.${kindKey}.description`)
          : undefined;
        const domain = DOMAIN[report.kind.split(".")[0] ?? ""] ?? FALLBACK_DOMAIN;
        const Icon = domain.icon;
        const formId = `report-args-${kindKey}`;
        return (
          <li key={report.kind} className={cn(isSelected && "md:col-span-2")}>
            <Card padding="md" className="h-full">
              <div className="flex items-start gap-4">
                <IconCircle tone={domain.tone} size="md">
                  <Icon />
                </IconCircle>
                <CardHeader className="min-w-0 flex-1">
                  <CardTitle as="h2">{label}</CardTitle>
                  {description && <CardDescription>{description}</CardDescription>}
                </CardHeader>
              </div>
              {isSelected ? (
                <div id={formId} className="flex flex-col gap-4 border-t border-line pt-4">
                  <ReportArgsForm key={report.kind} report={report} />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ChevronUp />}
                    className="self-start"
                    onClick={() => {
                      setSelectedKind(null);
                    }}
                  >
                    {t("close")}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  icon={<Download />}
                  className="mt-auto self-start"
                  aria-expanded={false}
                  aria-controls={formId}
                  onClick={() => {
                    setSelectedKind(report.kind);
                  }}
                >
                  {t("download")}
                </Button>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
