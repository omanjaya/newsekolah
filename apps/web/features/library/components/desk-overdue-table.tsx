"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import {
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  RowActionsMenu,
  SectionHeader,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { BellRing, BookCheck, RotateCw, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { todayInZone } from "../../../lib/tenant-date";
import { StudentLink } from "../../students/components/student-link";
import { useRenewLoanMutation, useReturnLoanMutation } from "../api";
import {
  type LibraryOverdueLoanDetail,
  useOverdueLoansDetailedQuery,
  useSendLibraryDueRemindersMutation,
} from "../desk-api";
import { formatShortDate } from "../lib/short-date";
import { useTenantTimeZone } from "../use-tenant-timezone";

import { DueBadge } from "./due-badge";
import { MarkLostDialog } from "./mark-lost-dialog";

/**
 * The overdue queue under the desk: who has which book, how late, and how
 * to reach a parent, longest overdue first. Kembalikan (the book is in the
 * librarian's hand) stays a button and asks first; Perpanjang and Tandai
 * hilang sit in the row's menu. Sending reminders asks first too.
 */
export function DeskOverdueTable(): ReactElement {
  const t = useTranslations("app.library.desk.overdue");
  const locale = useLocale() as Locale;
  const today = todayInZone(useTenantTimeZone());
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const { data, isLoading, isError, error, refetch, isRefetching } = useOverdueLoansDetailedQuery();
  const returnLoan = useReturnLoanMutation();
  const renew = useRenewLoanMutation();
  const sendReminders = useSendLibraryDueRemindersMutation();
  const [markingLost, setMarkingLost] = useState<string | null>(null);
  const [confirmingReturn, setConfirmingReturn] = useState<LibraryOverdueLoanDetail | null>(null);
  const [confirmingReminders, setConfirmingReminders] = useState(false);

  // Longest overdue first: the earliest due date leads.
  const items = useMemo(
    () => [...(data?.data ?? [])].sort((a, b) => a.loan.due_on.localeCompare(b.loan.due_on)),
    [data],
  );

  const showError = (failure: unknown) => {
    toast.error(
      failure instanceof ApiError ? apiErrorMessage(failure.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  const columns = useMemo<ColumnDef<LibraryOverdueLoanDetail>[]>(
    () => [
      {
        id: "member",
        header: t("columns.member"),
        enableSorting: false,
        accessorFn: (item) => `${item.member_name} ${item.member_no}`,
        meta: { card: "title", skeleton: "lines" },
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="font-semibold">
              <StudentLink
                studentId={row.original.loan.member_user_id}
                tab="library"
                isStudent={row.original.class_name !== ""}
              >
                {row.original.member_name || t("unknownMember")}
              </StudentLink>
            </span>
            <span className="text-caption text-fg-muted">
              {[row.original.member_no, row.original.class_name].filter(Boolean).join(" · ") || "-"}
            </span>
          </div>
        ),
      },
      {
        id: "title",
        header: t("columns.title"),
        accessorFn: (item) => `${item.title} ${item.barcode}`,
        enableSorting: false,
        meta: { card: "subtitle", skeleton: "lines" },
        // A table cell grows to fit unwrapped text, so the cap is what lets
        // a long title truncate instead of widening the table.
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col md:max-w-64">
            <span className="truncate">{row.original.title || t("unknownTitle")}</span>
            <span className="truncate text-caption text-fg-muted">{row.original.barcode}</span>
          </div>
        ),
      },
      {
        id: "dueOn",
        header: t("columns.dueOn"),
        accessorFn: (item) => item.loan.due_on,
        enableSorting: false,
        meta: { card: "meta", skeleton: "badge" },
        // The short badge with the date under it, like the name and title
        // cells: the full "Terlambat 43 hari (jatuh tempo 6 Okt)" badge
        // cannot wrap and pushed the row's actions out of a 1280px table.
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <DueBadge compact dueOn={row.original.loan.due_on} today={today} locale={locale} />
            <span className="text-caption whitespace-nowrap text-fg-muted">
              {t("dueDate", {
                date: formatShortDate(row.original.loan.due_on, locale, { today }),
              })}
            </span>
          </div>
        ),
      },
      {
        id: "guardianPhone",
        header: t("columns.guardianPhone"),
        accessorFn: (item) => item.guardian_phone,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.guardian_phone || "-"}</span>
        ),
      },
      {
        // Its own column, not the row's actions: a phone card keeps the
        // corner beside the name for the one icon menu, and this labelled
        // button joins the due badge on the meta row instead. The id
        // "action" keeps it out of the column menu, so it cannot be hidden.
        id: "action",
        header: () => <span className="sr-only">{t("return")}</span>,
        enableSorting: false,
        meta: { card: "meta", align: "end" },
        cell: ({ row }) => {
          const item = row.original;
          return (
            <Button
              size="sm"
              variant="secondary"
              icon={<BookCheck />}
              loading={returnLoan.isPending && returnLoan.variables.loanId === item.loan.id}
              onClick={() => {
                setConfirmingReturn(item);
              }}
            >
              {t("return")}
            </Button>
          );
        },
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => {
          const loan = row.original.loan;
          return (
            <div className="flex items-center justify-end gap-1">
              <RowActionsMenu
                ariaLabel={t("moreActions")}
                items={[
                  {
                    label: t("renew"),
                    icon: <RotateCw className="size-4" aria-hidden="true" />,
                    disabled: renew.isPending && renew.variables === loan.id,
                    onClick: () => {
                      renew.mutate(loan.id, {
                        onSuccess: () => {
                          toast.success(t("renewed"));
                        },
                        onError: showError,
                      });
                    },
                  },
                  {
                    label: t("markLost"),
                    icon: <TriangleAlert className="size-4" aria-hidden="true" />,
                    tone: "danger",
                    onClick: () => {
                      setMarkingLost(loan.id);
                    },
                  },
                ]}
              />
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showError only wraps toast and apiErrorMessage
    [t, locale, today, renew, returnLoan, toast, apiErrorMessage],
  );

  return (
    <section id="desk-overdue" className="flex scroll-mt-20 flex-col gap-3">
      <SectionHeader
        title={t("heading")}
        description={t("description")}
        count={items.length > 0 ? items.length : undefined}
        action={
          <Button
            size="sm"
            variant="secondary"
            icon={<BellRing />}
            loading={sendReminders.isPending}
            disabled={items.length === 0}
            onClick={() => {
              setConfirmingReminders(true);
            }}
          >
            {t("sendReminders")}
          </Button>
        }
      />
      <DataTable
        stateKey="features/library/components/desk-overdue-table:1"
        mode="local"
        // The overdue queue renders as cards on a phone; ten a page keeps it
        // a short scroll there even on an ordinary day.
        defaultPageSize={10}
        data={items}
        columns={columns}
        isLoading={isLoading}
        error={isError ? error : undefined}
        onRetry={() => void refetch()}
        retrying={isRefetching}
        getRowId={(item) => item.loan.id}
        emptyState={
          <EmptyState
            icon={<BookCheck aria-hidden="true" />}
            tone="success"
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />

      <ConfirmDialog
        open={confirmingReturn !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmingReturn(null);
        }}
        title={t("confirmReturn.title")}
        description={
          confirmingReturn
            ? t("confirmReturn.body", {
                title: confirmingReturn.title || t("unknownTitle"),
                member: confirmingReturn.member_name || t("unknownMember"),
              })
            : ""
        }
        confirmLabel={t("return")}
        confirming={returnLoan.isPending}
        onConfirm={() => {
          if (!confirmingReturn) return;
          returnLoan.mutate(
            { loanId: confirmingReturn.loan.id },
            {
              onSuccess: () => {
                toast.success(t("returned"));
              },
              onError: showError,
              onSettled: () => {
                setConfirmingReturn(null);
              },
            },
          );
        }}
      />

      <ConfirmDialog
        open={confirmingReminders}
        onOpenChange={setConfirmingReminders}
        title={t("confirmReminders.title")}
        description={t("confirmReminders.body")}
        confirmLabel={t("sendReminders")}
        confirming={sendReminders.isPending}
        onConfirm={() => {
          sendReminders.mutate(undefined, {
            onSuccess: (result) => {
              toast.success(t("remindersSent", { count: result.members_notified }));
            },
            onError: showError,
            onSettled: () => {
              setConfirmingReminders(false);
            },
          });
        }}
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
    </section>
  );
}
