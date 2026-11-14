"use client";

import { formatCurrency } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  DateRangePicker,
  EmptyState,
  Field,
  MonthPicker,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextLink,
  domainIcons,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, FileText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import {
  ReportExportDialog,
  type ReportExportColumn,
  type ReportExportOptions,
} from "../../../components/report-export-dialog";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useDateRangePresets } from "../../../lib/hooks/use-date-range-presets";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { startOfIsoMonth, thisMonthInZone, todayInZone } from "../../../lib/tenant-date";
import { useDirectoryLookup } from "../../reference/directory-names";
import {
  type LibraryMostBorrowedTitle,
  type LibraryOverdueMember,
  downloadMonthlyLibraryReportPdf,
  useLoansReportQuery,
  useMostBorrowedReportQuery,
  useOverdueMembersReportQuery,
} from "../api";
import { formatShortDate } from "../lib/short-date";
import { LOAN_STATUS_TONE, toneOf } from "../lib/status-tones";
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
 * switching sections never swaps the header.
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

  return (
    <AppPage
      title={embedded && !sectionNav ? t("title") : undefined}
      documentTitle={embedded ? t("title") : undefined}
      nav={sectionNav ?? (embedded ? false : undefined)}
      primaryAction={
        <Button
          icon={<Download />}
          onClick={() => {
            setDialogOpen(true);
          }}
        >
          {t("exportXlsx")}
        </Button>
      }
    >
      <Tabs
        className="flex flex-col gap-4"
        value={tab}
        onValueChange={(value) => {
          setTab(value as ReportTab);
        }}
      >
        <TabsList aria-label={t("tabsLabel")}>
          {REPORT_TABS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {t(`tabs.${key}`)}
            </TabsTrigger>
          ))}
        </TabsList>

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
          <LoansReportTable from={from} to={to} />
        </TabsContent>
        <TabsContent value="overdueMembers">
          <OverdueMembersReportTable />
        </TabsContent>
        <TabsContent value="mostBorrowed">
          <MostBorrowedReportTable from={from} to={to} />
        </TabsContent>
        <TabsContent value="summary">
          <ReportSummaryTable from={from} to={to} />
        </TabsContent>
        <TabsContent value="visits">
          <ReportVisitsTable from={from} to={to} />
        </TabsContent>
        <TabsContent value="members">
          <ReportMembersTable />
        </TabsContent>
        <TabsContent value="accessionRegister">
          <ReportAccessionRegisterTable from={from} to={to} />
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

type LoanReportRow = NonNullable<ReturnType<typeof useLoansReportQuery>["data"]>["data"][number];

function LoansReportTable({ from, to }: { from: string; to: string }): ReactElement {
  const t = useTranslations("app.library.reports.loans");
  const tStatus = useTranslations("app.library.memberHistory.status");
  const locale = useLocale() as Locale;
  const { data, isLoading, error, refetch } = useLoansReportQuery(from, to);
  const loans = data?.data ?? [];

  const columns = useMemo<ColumnDef<LoanReportRow>[]>(
    () => [
      {
        id: "title",
        header: t("columns.copy"),
        enableSorting: false,
        meta: { card: "title" },
        accessorFn: (row) => row.title,
      },
      {
        id: "member",
        header: t("columns.member"),
        enableSorting: false,
        meta: { card: "subtitle" },
        accessorFn: (row) => row.member_name,
        cell: ({ row }) => (
          <TextLink href={`/library/members/${row.original.loan.member_user_id}`}>
            {row.original.member_name}
          </TextLink>
        ),
      },
      {
        id: "borrowedAt",
        header: t("columns.borrowedAt"),
        enableSorting: false,
        cell: ({ row }) => formatShortDate(row.original.loan.borrowed_at, locale),
      },
      {
        id: "dueOn",
        header: t("columns.dueOn"),
        enableSorting: false,
        cell: ({ row }) => formatShortDate(row.original.loan.due_on, locale),
      },
      {
        id: "status",
        header: t("columns.status"),
        enableSorting: false,
        meta: { card: "meta", skeleton: "badge" },
        cell: ({ row }) => (
          <Badge tone={toneOf(LOAN_STATUS_TONE, row.original.loan.status)}>
            {tStatus.has(row.original.loan.status)
              ? tStatus(row.original.loan.status)
              : row.original.loan.status}
          </Badge>
        ),
      },
    ],
    [t, tStatus, locale],
  );

  return (
    <DataTable
      stateKey="features/library/components/library-reports-view:loans"
      mode="local"
      data={loans}
      columns={columns}
      searchable={loans.length > 10}
      isLoading={isLoading}
      error={error}
      onRetry={() => void refetch()}
      getRowId={(row) => row.loan.id}
      emptyState={
        <EmptyState icon={<domainIcons.library aria-hidden="true" />} title={t("emptyTitle")} />
      }
    />
  );
}

function OverdueMembersReportTable(): ReactElement {
  const t = useTranslations("app.library.reports.overdueMembers");
  const locale = useLocale() as Locale;
  const { data, isLoading, isError, error, refetch } = useOverdueMembersReportQuery();
  const members = useMemo(() => data?.data ?? [], [data]);
  const { names, isLoading: namesLoading } = useDirectoryLookup(
    members.map((member) => member.member_user_id),
  );

  const columns = useMemo<ColumnDef<LibraryOverdueMember>[]>(
    () => [
      {
        id: "member",
        header: t("columns.member"),
        enableSorting: false,
        meta: { card: "title" },
        accessorFn: (row) => names.get(row.member_user_id)?.name ?? t("unknownMember"),
        cell: ({ row }) => (
          <TextLink href={`/library/members/${row.original.member_user_id}`}>
            {names.get(row.original.member_user_id)?.name ?? t("unknownMember")}
          </TextLink>
        ),
      },
      {
        accessorKey: "loan_count",
        header: t("columns.loanCount"),
        enableSorting: false,
        meta: { align: "end" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.loan_count}</span>,
      },
      {
        accessorKey: "total_fine",
        header: t("columns.fine"),
        enableSorting: false,
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatCurrency(row.original.total_fine, "IDR", { locale })}
          </span>
        ),
      },
    ],
    [t, locale, names],
  );

  return (
    <DataTable
      stateKey="features/library/components/library-reports-view:overdue-members"
      mode="local"
      data={members}
      columns={columns}
      searchable={members.length > 10}
      isLoading={isLoading || (namesLoading && members.length > 0)}
      error={isError ? error : undefined}
      onRetry={() => void refetch()}
      getRowId={(row) => row.member_user_id}
      emptyState={
        <EmptyState icon={<domainIcons.library aria-hidden="true" />} title={t("emptyTitle")} />
      }
    />
  );
}

function MostBorrowedReportTable({ from, to }: { from: string; to: string }): ReactElement {
  const t = useTranslations("app.library.reports.mostBorrowed");
  const { data, isLoading, error, refetch } = useMostBorrowedReportQuery(from, to);
  const titles = data?.data ?? [];

  const columns = useMemo<ColumnDef<LibraryMostBorrowedTitle>[]>(
    () => [
      {
        id: "title",
        header: t("columns.title"),
        enableSorting: false,
        meta: { card: "title" },
        accessorFn: (row) => row.title.title,
        cell: ({ row }) => (
          <TextLink href={`/library/catalogue/${row.original.title.id}`}>
            {row.original.title.title}
          </TextLink>
        ),
      },
      {
        accessorKey: "loan_count",
        header: t("columns.loanCount"),
        enableSorting: false,
        meta: { align: "end" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.loan_count}</span>,
      },
    ],
    [t],
  );

  return (
    <DataTable
      stateKey="features/library/components/library-reports-view:most-borrowed"
      mode="local"
      data={titles}
      columns={columns}
      searchable={titles.length > 10}
      isLoading={isLoading}
      error={error}
      onRetry={() => void refetch()}
      getRowId={(row) => row.title.id}
      emptyState={
        <EmptyState icon={<domainIcons.library aria-hidden="true" />} title={t("emptyTitle")} />
      }
    />
  );
}
