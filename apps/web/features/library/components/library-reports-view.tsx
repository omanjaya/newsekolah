"use client";

import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  domainIcons,
} from "@newsekolah/ui";
import { Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import {
  ReportExportDialog,
  type ReportExportColumn,
  type ReportExportOptions,
} from "../../../components/report-export-dialog";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { businessNow } from "../../../lib/simulation/clock";
import {
  downloadMonthlyLibraryReportPdf,
  useLoansReportQuery,
  useMostBorrowedReportQuery,
  useOverdueMembersReportQuery,
} from "../api";
import {
  downloadLibraryAccessionRegisterReportXlsx,
  downloadLibraryMembersReportXlsx,
  downloadLibrarySummaryReportXlsx,
  downloadLibraryVisitsReportXlsx,
  downloadLoansReportXlsx,
  downloadMostBorrowedReportXlsx,
  downloadOverdueMembersReportXlsx,
} from "../reports-api";

import { ReportAccessionRegisterTable } from "./report-accession-register-table";
import { ReportMembersTable } from "./report-members-table";
import { ReportCard, ReportCardTitle, ReportField } from "./report-mobile-card";
import { ReportSummaryTable } from "./report-summary-table";
import { ReportVisitsTable } from "./report-visits-table";

type ReportTab =
  | "loans"
  | "overdueMembers"
  | "mostBorrowed"
  | "summary"
  | "visits"
  | "members"
  | "accessionRegister";

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

function todayIso(): string {
  return businessNow().toISOString().slice(0, 10);
}

function firstOfMonthIso(): string {
  const now = businessNow();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function monthIso(): string {
  return businessNow().toISOString().slice(0, 7);
}

export function LibraryReportsView({ tabKey = "tab" }: { tabKey?: string } = {}): ReactElement {
  const t = useTranslations("app.library.reports");
  const [tab, setTab] = useUrlState<ReportTab>(
    tabKey,
    [
      "loans",
      "overdueMembers",
      "mostBorrowed",
      "summary",
      "visits",
      "members",
      "accessionRegister",
    ],
    "loans",
  );
  const [from, setFrom] = useDateFilter("from", firstOfMonthIso());
  const [to, setTo] = useDateFilter("to", todayIso());
  const [month, setMonth] = useDateFilter("month", monthIso(), true);
  const [dialogOpen, setDialogOpen] = useState(false);

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
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as ReportTab);
        }}
      >
        <TabsList className="overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap">
          <TabsTrigger value="loans">{t("tabs.loans")}</TabsTrigger>
          <TabsTrigger value="overdueMembers">{t("tabs.overdueMembers")}</TabsTrigger>
          <TabsTrigger value="mostBorrowed">{t("tabs.mostBorrowed")}</TabsTrigger>
          <TabsTrigger value="summary">{t("tabs.summary")}</TabsTrigger>
          <TabsTrigger value="visits">{t("tabs.visits")}</TabsTrigger>
          <TabsTrigger value="members">{t("tabs.members")}</TabsTrigger>
          <TabsTrigger value="accessionRegister">{t("tabs.accessionRegister")}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-end justify-between gap-3">
        {!TABS_WITHOUT_DATE_RANGE.includes(tab) ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium text-fg">{t("fromLabel")}</span>
              <Input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium text-fg">{t("toLabel")}</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                }}
              />
            </label>
          </div>
        ) : (
          <span />
        )}
        <Button
          size="sm"
          variant="secondary"
          icon={<Download />}
          onClick={() => {
            setDialogOpen(true);
          }}
        >
          {t("exportXlsx")}
        </Button>
      </div>

      <ReportExportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        reportKey={`library.reports.${tab}`}
        defaultTitle={t(`export.${tab}.defaultTitle`)}
        availableColumns={exportColumns}
        columnsCustomizable={tab !== "summary"}
        onExport={handleExport}
      />

      {tab === "loans" && <LoansReportTable from={from} to={to} />}
      {tab === "overdueMembers" && <OverdueMembersReportTable />}
      {tab === "mostBorrowed" && <MostBorrowedReportTable from={from} to={to} />}
      {tab === "summary" && <ReportSummaryTable from={from} to={to} />}
      {tab === "visits" && <ReportVisitsTable from={from} to={to} />}
      {tab === "members" && <ReportMembersTable />}
      {tab === "accessionRegister" && <ReportAccessionRegisterTable from={from} to={to} />}

      <div className="flex flex-wrap items-end gap-3 border-t border-border pt-6">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("monthly.monthLabel")}</span>
          <Input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
            }}
          />
        </label>
        <Button
          size="sm"
          variant="secondary"
          icon={<Download />}
          onClick={() => {
            void downloadMonthlyLibraryReportPdf(month);
          }}
        >
          {t("monthly.download")}
        </Button>
      </div>
    </div>
  );
}

function LoansReportTable({ from, to }: { from: string; to: string }): ReactElement {
  const t = useTranslations("app.library.reports.loans");
  const tStatus = useTranslations("app.library.memberHistory.status");
  const locale = useLocale() as Locale;
  const { data, isLoading } = useLoansReportQuery(from, to);
  const loans = data?.data ?? [];

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (loans.length === 0) {
    return <EmptyState icon={<domainIcons.library aria-hidden="true" />} title={t("emptyTitle")} />;
  }

  const statusLabel = (status: string) => (tStatus.has(status) ? tStatus(status) : status);

  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden">
        {loans.map((row) => (
          <li key={row.loan.id}>
            <ReportCard>
              <ReportCardTitle>{row.title}</ReportCardTitle>
              <ReportField label={t("columns.member")} value={row.member_name} />
              <ReportField
                label={t("columns.borrowedAt")}
                value={formatDate(row.loan.borrowed_at, { locale })}
              />
              <ReportField
                label={t("columns.dueOn")}
                value={formatDate(row.loan.due_on, { locale })}
              />
              <ReportField label={t("columns.status")} value={statusLabel(row.loan.status)} />
            </ReportCard>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("columns.copy")}</TableHead>
              <TableHead scope="col">{t("columns.member")}</TableHead>
              <TableHead scope="col">{t("columns.borrowedAt")}</TableHead>
              <TableHead scope="col">{t("columns.dueOn")}</TableHead>
              <TableHead scope="col">{t("columns.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loans.map((row) => (
              <TableRow key={row.loan.id}>
                <TableCell>{row.title}</TableCell>
                <TableCell>{row.member_name}</TableCell>
                <TableCell className="text-fg-muted">
                  {formatDate(row.loan.borrowed_at, { locale })}
                </TableCell>
                <TableCell className="text-fg-muted">
                  {formatDate(row.loan.due_on, { locale })}
                </TableCell>
                <TableCell className="text-fg-muted">{statusLabel(row.loan.status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function OverdueMembersReportTable(): ReactElement {
  const t = useTranslations("app.library.reports.overdueMembers");
  const { data, isLoading } = useOverdueMembersReportQuery();
  const members = data?.data ?? [];

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden">
        {members.map((member) => (
          <li key={member.member_user_id}>
            <ReportCard>
              <ReportCardTitle>{member.member_user_id}</ReportCardTitle>
              <ReportField label={t("columns.loanCount")} value={member.loan_count} />
              <ReportField label={t("columns.fine")} value={member.total_fine} />
            </ReportCard>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table className="min-w-[480px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("columns.member")}</TableHead>
              <TableHead scope="col">{t("columns.loanCount")}</TableHead>
              <TableHead scope="col">{t("columns.fine")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.member_user_id}>
                <TableCell>{member.member_user_id}</TableCell>
                <TableCell className="text-fg-muted">{member.loan_count}</TableCell>
                <TableCell className="text-fg-muted">{member.total_fine}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function MostBorrowedReportTable({ from, to }: { from: string; to: string }): ReactElement {
  const t = useTranslations("app.library.reports.mostBorrowed");
  const { data, isLoading } = useMostBorrowedReportQuery(from, to);
  const titles = data?.data ?? [];

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden">
        {titles.map((entry) => (
          <li key={entry.title.id}>
            <ReportCard>
              <ReportCardTitle>{entry.title.title}</ReportCardTitle>
              <ReportField label={t("columns.loanCount")} value={entry.loan_count} />
            </ReportCard>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table className="min-w-[480px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("columns.title")}</TableHead>
              <TableHead scope="col">{t("columns.loanCount")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {titles.map((entry) => (
              <TableRow key={entry.title.id}>
                <TableCell>{entry.title.title}</TableCell>
                <TableCell className="text-fg-muted">{entry.loan_count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
