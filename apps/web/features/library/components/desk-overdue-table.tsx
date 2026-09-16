"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Button, DataTable, EmptyState, domainIcons, useToast } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { BellRing } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import { useRenewLoanMutation, useReturnLoanMutation } from "../api";
import {
  type LibraryOverdueLoanDetail,
  useOverdueLoansDetailedQuery,
  useSendLibraryDueRemindersMutation,
} from "../desk-api";

import { MarkLostDialog } from "./mark-lost-dialog";

/** Overdue loans with class and guardian phone, plus one button to run the due-date reminder pass. */
export function DeskOverdueTable(): ReactElement {
  const t = useTranslations("app.library.desk.overdue");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const { data, isLoading } = useOverdueLoansDetailedQuery();
  const directory = useDirectoryQuery();
  const memberMap = useLookup(directory.data?.data);
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
        cell: ({ row }) =>
          memberMap.get(row.original.loan.member_user_id)?.name ?? row.original.loan.member_user_id,
      },
      { accessorKey: "class_name", header: t("columns.class"), enableSorting: false },
      {
        id: "guardianPhone",
        header: t("columns.guardianPhone"),
        enableSorting: false,
        cell: ({ row }) => row.original.guardian_phone || "-",
      },
      {
        id: "dueOn",
        header: t("columns.dueOn"),
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
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  renew.mutate(loan.id, {
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
                    { loanId: loan.id },
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
                  setMarkingLost(loan.id);
                }}
              >
                {t("markLost")}
              </Button>
            </div>
          );
        },
      },
    ],
    [t, locale, memberMap, renew, returnLoan, toast, apiErrorMessage],
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
