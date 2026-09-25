"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Alert, Button, DataTable, EmptyState, domainIcons, useToast } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { BellRing } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useRenewLoanMutation, useReturnLoanMutation } from "../api";
import {
  type LibraryOverdueLoanDetail,
  useOverdueLoansDetailedQuery,
  useSendLibraryDueRemindersMutation,
} from "../desk-api";

import { DeskOverdueRowActions } from "./desk-overdue-row-actions";
import { MarkLostDialog } from "./mark-lost-dialog";

/** Overdue loans with class and guardian phone, plus one button to run the due-date reminder pass. */
export function DeskOverdueTable(): ReactElement {
  const t = useTranslations("app.library.desk.overdue");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const { data, isLoading, isError, refetch } = useOverdueLoansDetailedQuery();
  const tCommon = useTranslations("common.actions");
  const returnLoan = useReturnLoanMutation();
  const renew = useRenewLoanMutation();
  const sendReminders = useSendLibraryDueRemindersMutation();
  const [markingLost, setMarkingLost] = useState<string | null>(null);

  const items = data?.data ?? [];

  const columns = useMemo<ColumnDef<LibraryOverdueLoanDetail>[]>(
    () => [
      {
        id: "member",
        header: t("columns.member"),
        enableSorting: false,
        accessorFn: (item) => `${item.member_name} ${item.member_no}`,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span>{row.original.member_name || t("unknownMember")}</span>
            {row.original.member_no && (
              <span className="text-[12px] text-fg-muted">{row.original.member_no}</span>
            )}
          </div>
        ),
      },
      {
        id: "title",
        header: t("columns.title"),
        accessorFn: (item) => `${item.title} ${item.barcode}`,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span>{row.original.title || t("unknownTitle")}</span>
            <span className="text-[12px] text-fg-muted">{row.original.barcode}</span>
          </div>
        ),
      },
      { accessorKey: "class_name", header: t("columns.class"), enableSorting: false },
      {
        id: "guardianPhone",
        header: t("columns.guardianPhone"),
        accessorFn: (item) => item.guardian_phone,
        enableSorting: false,
        cell: ({ row }) => row.original.guardian_phone || "-",
      },
      {
        id: "dueOn",
        header: t("columns.dueOn"),
        accessorFn: (item) => item.loan.due_on,
        enableSorting: false,
        cell: ({ row }) => formatDate(row.original.loan.due_on, { locale }),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => {
          const loan = row.original.loan;
          return (
            <DeskOverdueRowActions
              returning={returnLoan.isPending && returnLoan.variables.loanId === loan.id}
              renewing={renew.isPending && renew.variables === loan.id}
              onRenew={() => {
                renew.mutate(loan.id, {
                  onSuccess: () => {
                    toast.success(t("renewed"));
                  },
                  onError: (error) => {
                    toast.error(
                      error instanceof ApiError
                        ? apiErrorMessage(error.code)
                        : apiErrorMessage("UNKNOWN"),
                    );
                  },
                });
              }}
              onReturn={() => {
                returnLoan.mutate(
                  { loanId: loan.id },
                  {
                    onSuccess: () => {
                      toast.success(t("returned"));
                    },
                    onError: (error) => {
                      toast.error(
                        error instanceof ApiError
                          ? apiErrorMessage(error.code)
                          : apiErrorMessage("UNKNOWN"),
                      );
                    },
                  },
                );
              }}
              onMarkLost={() => {
                setMarkingLost(loan.id);
              }}
            />
          );
        },
      },
    ],
    [t, locale, renew, returnLoan, toast, apiErrorMessage],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-fg">{t("heading")}</h2>
        <Button
          size="sm"
          variant="secondary"
          icon={<BellRing />}
          loading={sendReminders.isPending}
          disabled={items.length === 0}
          onClick={() => {
            sendReminders.mutate(undefined, {
              onSuccess: (result) => {
                toast.success(t("remindersSent", { count: result.members_notified }));
              },
              onError: (error) => {
                toast.error(
                  error instanceof ApiError
                    ? apiErrorMessage(error.code)
                    : apiErrorMessage("UNKNOWN"),
                );
              },
            });
          }}
        >
          {t("sendReminders")}
        </Button>
      </div>
      {isError ? (
        <Alert variant="warning" title={t("loadError")}>
          <Button variant="secondary" onClick={() => void refetch()}>
            {tCommon("retry")}
          </Button>
        </Alert>
      ) : (
        <DataTable
          stateKey="features/library/components/desk-overdue-table:1"
          mode="local"
          // The overdue queue renders as tall stacked cards on a phone
          // (packages/ui's DataTableCards), not dense table rows -- the
          // shared component's 50-row default page is a long scroll there
          // even on an ordinary day (docs/analysis/ux-audit-2026-09-25.md
          // finding 8). Every page now holds 10 rows instead of 50;
          // search/filter and the existing prev/next pagination controls
          // are otherwise unchanged.
          defaultPageSize={10}
          data={items}
          columns={columns}
          isLoading={isLoading}
          getRowId={(item) => item.loan.id}
          emptyState={
            <EmptyState
              icon={<domainIcons.library aria-hidden="true" />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
            />
          }
        />
      )}

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
