"use client";

import { formatCurrency } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Badge, DataTable, EmptyState, TextLink, domainIcons } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo } from "react";

import { useDirectoryLookup } from "../../reference/directory-names";
import {
  type LibraryMostBorrowedTitle,
  type LibraryOverdueMember,
  useLoansReportQuery,
  useMostBorrowedReportQuery,
  useOverdueMembersReportQuery,
} from "../api";
import { formatShortDate } from "../lib/short-date";
import { LOAN_STATUS_TONE, toneOf } from "../lib/status-tones";

/*
 * The library reports' circulation tabs: loans in a period, members with
 * overdue loans, and the most borrowed titles. Each is a table of its own
 * under the reports page's tabs (library-reports-view.tsx).
 */

type LoanReportRow = NonNullable<ReturnType<typeof useLoansReportQuery>["data"]>["data"][number];

/** Loans borrowed in the period, each naming its borrower. */
export function LoansReportTable({ from, to }: { from: string; to: string }): ReactElement {
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

/** Members with an overdue loan now: how many and the fines they owe. */
export function OverdueMembersReportTable(): ReactElement {
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

/** The titles borrowed most in the period. */
export function MostBorrowedReportTable({ from, to }: { from: string; to: string }): ReactElement {
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
