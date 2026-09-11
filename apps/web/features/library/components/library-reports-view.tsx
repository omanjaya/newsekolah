"use client";

import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  domainIcons,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import {
  useLoansReportQuery,
  useMostBorrowedReportQuery,
  useOverdueMembersReportQuery,
} from "../api";

type ReportTab = "loans" | "overdueMembers" | "mostBorrowed";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

export function LibraryReportsView(): ReactElement {
  const t = useTranslations("app.library.reports");
  const [tab, setTab] = useState<ReportTab>("loans");
  const [from, setFrom] = useState(firstOfMonthIso());
  const [to, setTo] = useState(todayIso());

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as ReportTab);
        }}
      >
        <TabsList>
          <TabsTrigger value="loans">{t("tabs.loans")}</TabsTrigger>
          <TabsTrigger value="overdueMembers">{t("tabs.overdueMembers")}</TabsTrigger>
          <TabsTrigger value="mostBorrowed">{t("tabs.mostBorrowed")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab !== "overdueMembers" && (
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
      )}

      {tab === "loans" && <LoansReportTable from={from} to={to} />}
      {tab === "overdueMembers" && <OverdueMembersReportTable />}
      {tab === "mostBorrowed" && <MostBorrowedReportTable from={from} to={to} />}
    </div>
  );
}

function LoansReportTable({ from, to }: { from: string; to: string }): ReactElement {
  const t = useTranslations("app.library.reports.loans");
  const locale = useLocale() as Locale;
  const { data, isLoading } = useLoansReportQuery(from, to);
  const loans = data?.data ?? [];

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (loans.length === 0) {
    return <EmptyState icon={<domainIcons.library aria-hidden="true" />} title={t("emptyTitle")} />;
  }

  return (
    <div className="overflow-x-auto rounded-sm border border-border bg-surface">
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
              <td className="px-3 py-2 text-fg-muted">{formatDate(row.loan.due_on, { locale })}</td>
              <td className="px-3 py-2 text-fg-muted">{row.loan.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverdueMembersReportTable(): ReactElement {
  const t = useTranslations("app.library.reports.overdueMembers");
  const { data, isLoading } = useOverdueMembersReportQuery();
  const members = data?.data ?? [];

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="overflow-x-auto rounded-sm border border-border bg-surface">
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
  );
}

function MostBorrowedReportTable({ from, to }: { from: string; to: string }): ReactElement {
  const t = useTranslations("app.library.reports.mostBorrowed");
  const { data, isLoading } = useMostBorrowedReportQuery(from, to);
  const titles = data?.data ?? [];

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="overflow-x-auto rounded-sm border border-border bg-surface">
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
  );
}
