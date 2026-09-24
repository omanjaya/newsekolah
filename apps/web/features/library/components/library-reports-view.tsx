"use client";

import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
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
 * "summary" is not in this map: its two-sheet workbook has not moved
 * onto reportdoc (see docs/15-paritas-sion.md), so its tab keeps the
 * plain xlsx-only download below instead of a dialog.
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
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function monthIso(): string {
  return new Date().toISOString().slice(0, 7);
}

export function LibraryReportsView(): ReactElement {
  const t = useTranslations("app.library.reports");
  const [tab, setTab] = useUrlState<ReportTab>(
    "tab",
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

  // "summary" has no reportdoc export (see REPORT_EXPORT_COLUMN_KEYS'
  // comment), so it keeps the old immediate xlsx-only download.
  const exportOptions: Record<
    Exclude<ReportTab, "summary">,
    (options: ReportExportOptions) => Promise<void>
  > = {
    loans: (options) => downloadLoansReportXlsx(from, to, options),
    overdueMembers: (options) => downloadOverdueMembersReportXlsx(options),
    mostBorrowed: (options) => downloadMostBorrowedReportXlsx(from, to, options),
    visits: (options) => downloadLibraryVisitsReportXlsx(from, to, options),
    members: (options) => downloadLibraryMembersReportXlsx(options),
    accessionRegister: (options) => downloadLibraryAccessionRegisterReportXlsx(from, to, options),
  };

  async function handleExport(options: ReportExportOptions) {
    if (tab === "summary") return;
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
            if (tab === "summary") {
              void downloadLibrarySummaryReportXlsx(from, to);
              return;
            }
            setDialogOpen(true);
          }}
        >
          {t("exportXlsx")}
        </Button>
      </div>

      {tab !== "summary" && (
        <ReportExportDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          reportKey={`library.reports.${tab}`}
          defaultTitle={t(`export.${tab}.defaultTitle`)}
          availableColumns={exportColumns}
          onExport={handleExport}
        />
      )}

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
      <div className="hidden overflow-x-auto rounded-sm border border-border bg-surface md:block">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr className="bg-bg text-left text-fg-muted">
              <th scope="col" className="px-3 py-2 font-medium">
                {t("columns.copy")}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t("columns.member")}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t("columns.borrowedAt")}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t("columns.dueOn")}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t("columns.status")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loans.map((row) => (
              <tr key={row.loan.id}>
                <td className="px-3 py-2 text-fg">{row.title}</td>
                <td className="px-3 py-2 text-fg">{row.member_name}</td>
                <td className="px-3 py-2 text-fg-muted">
                  {formatDate(row.loan.borrowed_at, { locale })}
                </td>
                <td className="px-3 py-2 text-fg-muted">
                  {formatDate(row.loan.due_on, { locale })}
                </td>
                <td className="px-3 py-2 text-fg-muted">{statusLabel(row.loan.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <div className="hidden overflow-x-auto rounded-sm border border-border bg-surface md:block">
        <table className="w-full min-w-[480px] text-[13px]">
          <thead>
            <tr className="bg-bg text-left text-fg-muted">
              <th scope="col" className="px-3 py-2 font-medium">
                {t("columns.member")}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t("columns.loanCount")}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t("columns.fine")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((member) => (
              <tr key={member.member_user_id}>
                <td className="px-3 py-2 text-fg">{member.member_user_id}</td>
                <td className="px-3 py-2 text-fg-muted">{member.loan_count}</td>
                <td className="px-3 py-2 text-fg-muted">{member.total_fine}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <div className="hidden overflow-x-auto rounded-sm border border-border bg-surface md:block">
        <table className="w-full min-w-[480px] text-[13px]">
          <thead>
            <tr className="bg-bg text-left text-fg-muted">
              <th scope="col" className="px-3 py-2 font-medium">
                {t("columns.title")}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t("columns.loanCount")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {titles.map((entry) => (
              <tr key={entry.title.id}>
                <td className="px-3 py-2 text-fg">{entry.title.title}</td>
                <td className="px-3 py-2 text-fg-muted">{entry.loan_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
