"use client";

import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  IconCircle,
  List,
  ListRow,
  Sheet,
  SheetContent,
  SkeletonCards,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  domainIcons,
  useMediaQuery,
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
/** Kinds whose topic is more specific than their first segment ("permits.leave_requests"). */
const KIND_DOMAIN: Record<string, { icon: LucideIcon; tone: CategoryTone }> = {
  "permits.leave_requests": { icon: domainIcons.leave, tone: "amber" },
  "discipline.warning_letters": { icon: domainIcons.warningLetter, tone: "red" },
};
const FALLBACK_DOMAIN = { icon: domainIcons.document, tone: "purple" as const };

function domainOf(kind: string): { icon: LucideIcon; tone: CategoryTone } {
  return KIND_DOMAIN[kind] ?? DOMAIN[kind.split(".")[0] ?? ""] ?? FALLBACK_DOMAIN;
}

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
    <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-4">
      <TabsList aria-label={t("tabsLabel")}>
        <TabsTrigger value="exports">{t("tabs.exports")}</TabsTrigger>
        <TabsTrigger value="schedules">{t("tabs.schedules")}</TabsTrigger>
      </TabsList>
      <TabsContent value="exports" className="pt-0">
        <ExportsTab />
      </TabsContent>
      <TabsContent value="schedules" className="pt-0">
        <SchedulesView />
      </TabsContent>
    </Tabs>
  );
}

function ExportsTab(): ReactElement {
  const t = useTranslations("app.reports");
  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  const reports = useReportsQuery();
  const wide = useMediaQuery("(min-width: 768px)");

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

  const labelOf = (kind: string) => {
    const key = kind.replaceAll(".", "_");
    return t.has(`kinds.${key}.label`) ? t(`kinds.${key}.label`) : kind;
  };
  const descriptionOf = (kind: string) => {
    const key = kind.replaceAll(".", "_");
    return t.has(`kinds.${key}.description`) ? t(`kinds.${key}.description`) : undefined;
  };

  if (!wide) {
    // On a phone the catalogue is one list; a row opens its export settings
    // in a bottom sheet instead of growing a card in place.
    const chosen = items.find((report) => report.kind === selectedKind);
    return (
      <>
        <List framed aria-label={t("title")}>
          {items.map((report) => {
            const domain = domainOf(report.kind);
            const Icon = domain.icon;
            return (
              <ListRow
                key={report.kind}
                leading={
                  <IconCircle tone={domain.tone} size="md">
                    <Icon />
                  </IconCircle>
                }
                title={labelOf(report.kind)}
                meta={descriptionOf(report.kind)}
                chevron
                onClick={() => {
                  setSelectedKind(report.kind);
                }}
              />
            );
          })}
        </List>
        <Sheet
          open={Boolean(chosen)}
          onOpenChange={(open) => {
            if (!open) setSelectedKind(null);
          }}
        >
          {chosen && (
            <SheetContent title={labelOf(chosen.kind)} description={descriptionOf(chosen.kind)}>
              <ReportArgsForm key={chosen.kind} report={chosen} />
            </SheetContent>
          )}
        </Sheet>
      </>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {items.map((report) => {
        const isSelected = selectedKind === report.kind;
        // Report kinds are dotted slugs ("attendance.daily"), but a
        // next-intl key cannot contain a dot: it is the namespace
        // separator. The catalog uses underscores instead.
        const kindKey = report.kind.replaceAll(".", "_");
        const label = labelOf(report.kind);
        const description = descriptionOf(report.kind);
        const domain = domainOf(report.kind);
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
                  {t("setUpDownload")}
                </Button>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
