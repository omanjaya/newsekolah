"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  BarcodeScannerField,
  Button,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { BarcodeScanEvent } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type LibraryLoan,
  useBorrowLoanMutation,
  useOverdueLoansQuery,
  useRenewLoanMutation,
  useReturnLoanMutation,
} from "../api";

import { MarkLostDialog } from "./mark-lost-dialog";

export function LoanDeskView(): ReactElement {
  const t = useTranslations("app.library.desk");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const [memberId, setMemberId] = useState("");
  const [markingLost, setMarkingLost] = useState<string | null>(null);
  const borrow = useBorrowLoanMutation();
  const returnLoan = useReturnLoanMutation();
  const renew = useRenewLoanMutation();
  const { data, isLoading } = useOverdueLoansQuery();
  const overdue = data?.data ?? [];

  const handleScan = (event: BarcodeScanEvent) => {
    if (!memberId.trim()) {
      toast.error(t("borrow.memberIdRequired"));
      return;
    }
    borrow.mutate(
      { barcode: event.code, member_user_id: memberId.trim() },
      {
        onSuccess: () => {
          toast.success(t("borrow.success"));
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  };

  const columns = useMemo<ColumnDef<LibraryLoan>[]>(
    () => [
      { accessorKey: "member_user_id", header: t("overdue.columns.member"), enableSorting: false },
      {
        accessorKey: "due_on",
        header: t("overdue.columns.dueOn"),
        enableSorting: false,
        cell: ({ row }) => formatDate(row.original.due_on, { locale }),
      },
      {
        id: "actions",
        header: t("overdue.columns.actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                renew.mutate(row.original.id, {
                  onSuccess: () => toast.success(t("renewed")),
                  onError: (error) =>
                    toast.error(
                      error instanceof ApiError
                        ? apiErrorMessage(error.code)
                        : apiErrorMessage("UNKNOWN"),
                    ),
                });
              }}
            >
              {t("renew")}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                returnLoan.mutate(
                  { loanId: row.original.id },
                  {
                    onSuccess: () => toast.success(t("returned")),
                    onError: (error) =>
                      toast.error(
                        error instanceof ApiError
                          ? apiErrorMessage(error.code)
                          : apiErrorMessage("UNKNOWN"),
                      ),
                  },
                );
              }}
            >
              {t("return")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-status-absent"
              onClick={() => {
                setMarkingLost(row.original.id);
              }}
            >
              {t("markLost")}
            </Button>
          </div>
        ),
      },
    ],
    [t, locale, renew, returnLoan, toast, apiErrorMessage],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-border bg-surface p-4">
        <h2 className="w-full text-[15px] font-semibold text-fg">{t("borrow.heading")}</h2>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("borrow.memberId")}</span>
          <Input
            value={memberId}
            onChange={(e) => {
              setMemberId(e.target.value);
            }}
            required
            maxLength={64}
          />
        </label>
        <BarcodeScannerField
          label={t("borrow.barcode")}
          onScan={handleScan}
          submitLabel={t("borrow.submit")}
          disabled={borrow.isPending}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-fg">{t("overdue.heading")}</h2>
        <DataTable
          data={overdue}
          columns={columns}
          rowCount={overdue.length}
          pagination={{ pageIndex: 0, pageSize: 50 }}
          onPaginationChange={() => undefined}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter=""
          onGlobalFilterChange={() => undefined}
          isLoading={isLoading}
          getRowId={(item) => item.id}
          emptyState={
            <EmptyState
              icon={<domainIcons.library aria-hidden="true" />}
              title={t("overdue.emptyTitle")}
              description={t("overdue.emptyBody")}
            />
          }
        />
      </div>

      <MarkLostDialog
        loanId={markingLost}
        onOpenChange={(open) => {
          if (!open) setMarkingLost(null);
        }}
        onDone={() => {
          setMarkingLost(null);
        }}
      />
    </div>
  );
}
