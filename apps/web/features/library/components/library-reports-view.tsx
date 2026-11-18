"use client";

import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  DateRangePicker,
  Field,
  MonthPicker,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@newsekolah/ui";
import { Download, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import {
  ReportExportDialog,
  type ReportExportColumn,
  type ReportExportOptions,
} from "../../../components/report-export-dialog";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useDateRangePresets } from "../../../lib/hooks/use-date-range-presets";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import {
  endOfPreviousIsoMonth,
  startOfIsoMonth,
  startOfPreviousIsoMonth,
  thisMonthInZone,
  todayInZone,
} from "../../../lib/tenant-date";
import { downloadMonthlyLibraryReportPdf } from "../api";
import {
  downloadLibraryAccessionRegisterReportXlsx,
  downloadLibraryMembersReportXlsx,
  downloadLibrarySummaryReportXlsx,
  downloadLibraryVisitsReportXlsx,
  downloadLoansReportXlsx,
  downloadMostBorrowedReportXlsx,
  downloadOverdueMembersReportXlsx,
} from "../reports-api";
import { useTenantTimeZone } from "../use-tenant-timezone";

import { ReportAccessionRegisterTable } from "./report-accession-register-table";
import {
  LoansReportTable,
  MostBorrowedReportTable,
  OverdueMembersReportTable,
} from "./report-circulation-tables";
import { ReportMembersTable } from "./report-members-table";
import { ReportSummaryTable } from "./report-summary-table";
import { ReportVisitsTable } from "./report-visits-table";

const REPORT_TABS = [
  "loans",
  "overdueMembers",
  "mostBorrowed",
  "summary",
  "visits",
  "members",
  "accessionRegister",
] as const;

type ReportTab = (typeof REPORT_TABS)[number];

const TABS_WITHOUT_DATE_RANGE: ReportTab[] = ["overdueMembers", "members"];

/**
 * Every migrated report's stable column keys, in the exact order and
 * spelling `library/service/reports_xlsx.go`'s Column sets declare.
 * "summary" is not in this map: its two sections have different column
 * counts (a key/value indicator table, a Dewey-class breakdown), so its
 * tab uses the dialog with `columnsCustomizable={false}` instead of a
 * fixed column list -- see reportdoc.Section.Columns.
 */
const REPORT_EXPORT_COLUMN_KEYS: Record<Exclude<ReportTab, "summary">, readonly string[]> = {
  loans: ["title", "borrower", "borrowed_at", "due_on", "returned_at", "status", "fine"],
  overdueMembers: ["member", "loan_count", "fine"],
  mostBorrowed: ["name", "detail", "loan_count"],
  visits: ["label", "count"],
  members: ["label", "count"],
  accessionRegister: [
    "accession_number",
    "barcode",
    "call_number",
    "status",
    "price",
    "acquired_on",
  ],
};

/**
 * The library's reports: one pill tab per report, the period they cover
 * (where it applies) and the XLSX export above the tab's table, and the
 * monthly PDF in its own card. On its own route the page shows the
 * reports area's tabs; inside the reports hub (`tabKey` other than "tab")
 * it is one section of that page. `sectionNav` is the hub's strip of
 * report sections when the reader has more than one: the page then keeps
 * the hub's title, as the report centre does, with the strip under it, so
 * switching sections never swaps the header. Below md the seven reports
 * are a Select instead of a second scrolling tab row under the page's own.
 */
export function LibraryReportsView({
  tabKey = "tab",
  sectionNav,
}: { tabKey?: string; sectionNav?: ReactNode } = {}): ReactElement {
  const t = useTranslations("app.library.reports");
  const timeZone = useTenantTimeZone();
  const today = todayInZone(timeZone);
  const presets = useDateRangePresets();
  const [tab, setTab] = useUrlState<ReportTab>(tabKey, REPORT_TABS, "loans");
  const [from, setFrom] = useDateFilter("from", startOfIsoMonth(today));
  const [to, setTo] = useDateFilter("to", today);
  const [month, setMonth] = useDateFilter("month", thisMonthInZone(timeZone), true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const embedded = tabKey !== "tab";

  const exportOptions: Record<ReportTab, (options: ReportExportOptions) => Promise<void>> = {
    loans: (options) => downloadLoansReportXlsx(from, to, options),
    overdueMembers: (options) => downloadOverdueMembersReportXlsx(options),
    mostBorrowed: (options) => downloadMostBorrowedReportXlsx(from, to, options),
    summary: (options) => downloadLibrarySummaryReportXlsx(from, to, options),
    visits: (options) => downloadLibraryVisitsReportXlsx(from, to, options),
    members: (options) => downloadLibraryMembersReportXlsx(options),
    accessionRegister: (options) => downloadLibraryAccessionRegisterReportXlsx(from, to, options),
  };

  async function handleExport(options: ReportExportOptions) {
    await exportOptions[tab](options);
  }

  const exportColumns: ReportExportColumn[] =
    tab === "summary"
      ? []
      : REPORT_EXPORT_COLUMN_KEYS[tab].map((key) => ({
          key,
          label: t(`export.${tab}.columns.${key}`),
        }));

  // An empty period report offers a way on: the month before the one shown.
  const earlierPeriod = (
    <Button
      variant="secondary"
      onClick={() => {
        setFrom(startOfPreviousIsoMonth(from));
        setTo(endOfPreviousIsoMonth(from));
      }}
    >
      {t("earlierPeriod")}
    </Button>
  );

  return (
    <AppPage
      title={embedded && !sectionNav ? t("title") : undefined}
      documentTitle={embedded ? t("title") : undefined}
      nav={sectionNav ?? (embedded ? false : undefined)}
      // A secondary "Unduh laporan", as the other report sections have:
      // the dialog offers XLSX and PDF, and reading is the page's job.
      secondaryActions={[
        {
          label: t("exportXlsx"),
          icon: <Download />,
          onSelect: () => {
            setDialogOpen(true);
          },
        },
      ]}
    >
      <Tabs
        className="flex flex-col gap-4"
        value={tab}
        onValueChange={(value) => {
          setTab(value as ReportTab);
        }}
      >
        <TabsList aria-label={t("tabsLabel")} className="max-md:hidden">
          {REPORT_TABS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {t(`tabs.${key}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <Field label={t("typeLabel")} className="sm:max-w-xs md:hidden">
          <Select
            options={REPORT_TABS.map((key) => ({ value: key, label: t(`tabs.${key}`) }))}
            value={tab}
            onValueChange={(value) => {
              setTab(value as ReportTab);
            }}
          />
        </Field>

        {!TABS_WITHOUT_DATE_RANGE.includes(tab) && (
          <Field label={t("periodLabel")} className="sm:max-w-xs">
            <DateRangePicker
              value={{ from, to }}
              onChange={(range) => {
                if (!range.from || !range.to) return;
                setFrom(range.from);
                setTo(range.to);
              }}
              presets={presets}
              today={today}
            />
          </Field>
        )}

        <TabsContent value="loans">
          <LoansReportTable from={from} to={to} emptyAction={earlierPeriod} />
        </TabsContent>
        <TabsContent value="overdueMembers">
          <OverdueMembersReportTable />
        </TabsContent>
        <TabsContent value="mostBorrowed">
          <MostBorrowedReportTable from={from} to={to} emptyAction={earlierPeriod} />
        </TabsContent>
        <TabsContent value="summary">
          <ReportSummaryTable from={from} to={to} />
        </TabsContent>
        <TabsContent value="visits">
          <ReportVisitsTable from={from} to={to} emptyAction={earlierPeriod} />
        </TabsContent>
        <TabsContent value="members">
          <ReportMembersTable />
        </TabsContent>
        <TabsContent value="accessionRegister">
          <ReportAccessionRegisterTable from={from} to={to} emptyAction={earlierPeriod} />
        </TabsContent>
      </Tabs>

      <ReportExportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        reportKey={`library.reports.${tab}`}
        defaultTitle={t(`export.${tab}.defaultTitle`)}
        availableColumns={exportColumns}
        columnsCustomizable={tab !== "summary"}
        onExport={handleExport}
      />

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("monthly.heading")}</CardTitle>
          <CardDescription>{t("monthly.description")}</CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-3 px-5 pb-5 sm:flex-row sm:items-end">
          <Field label={t("monthly.monthLabel")} className="sm:w-56">
            <MonthPicker value={month} onChange={setMonth} />
          </Field>
          <Button
            variant="secondary"
            icon={<FileText />}
            onClick={() => {
              void downloadMonthlyLibraryReportPdf(month);
            }}
          >
            {t("monthly.download")}
          </Button>
        </div>
      </Card>
    </AppPage>
  );
}
