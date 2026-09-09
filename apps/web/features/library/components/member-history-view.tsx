"use client";

import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Badge, Button, DataTable, EmptyState, PageHeader, domainIcons } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo } from "react";

import {
  type LibraryLoan,
  printMemberCard,
  useMemberLoanHistoryQuery,
  useMemberReservationsQuery,
} from "../api";

export function MemberHistoryView({ userId }: { userId: string }): ReactElement {
  const t = useTranslations("app.library.memberHistory");
  const locale = useLocale() as Locale;
  const loans = useMemberLoanHistoryQuery(userId);
  const reservations = useMemberReservationsQuery(userId);
  const items = loans.data?.data ?? [];

  const columns = useMemo<ColumnDef<LibraryLoan>[]>(
    () => [
      { accessorKey: "title_id", header: t("columns.title"), enableSorting: false },
      {
        accessorKey: "borrowed_at",
        header: t("columns.borrowedAt"),
        enableSorting: false,
        cell: ({ row }) => formatDate(row.original.borrowed_at, { locale }),
      },
      {
        accessorKey: "due_on",
        header: t("columns.dueOn"),
        enableSorting: false,
        cell: ({ row }) => formatDate(row.original.due_on, { locale }),
      },
      {
        accessorKey: "status",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "accent" : "neutral"}>
            {t(`status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        accessorKey: "fine_amount",
        header: t("columns.fine"),
        enableSorting: false,
      },
    ],
    [t, locale],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("title")}
        title={userId}
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              void printMemberCard(userId);
            }}
          >
            {t("printCard")}
          </Button>
        }
      />

      <DataTable
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        onGlobalFilterChange={() => undefined}
        isLoading={loans.isLoading}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState icon={<domainIcons.library aria-hidden="true" />} title={t("emptyTitle")} />
        }
      />

      {(reservations.data?.data.length ?? 0) > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold text-fg">{t("reservationsHeading")}</h2>
          <ul className="flex flex-col gap-1 text-[13px]">
            {reservations.data?.data.map((r) => (
              <li key={r.id} className="rounded-sm border border-border bg-surface p-2">
                {r.title_id} - {r.status}
                {r.position ? ` (#${r.position})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
