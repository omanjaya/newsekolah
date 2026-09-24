"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatCurrency } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  useToast,
} from "@newsekolah/ui";
import { History, MoreHorizontal, RotateCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type LibraryLoan, useRenewLoanMutation } from "../api";
import { classifyDueDate, overdueDays } from "../lib/due-date";

import { DueBadge } from "./due-badge";
import { LibraryTitleName } from "./library-title-name";

/**
 * One current loan on a member's profile: title, due-date urgency, and
 * secondary actions (Perpanjang, riwayat perpanjangan, tandai hilang)
 * collapsed behind a labelled "..." menu instead of a row of bare-icon
 * buttons (docs/07-ui-ux.md).
 */
export function MemberLoanRow({
  loan,
  today,
  locale,
  canManage,
  onViewRenewals,
  onMarkLost,
}: {
  loan: LibraryLoan;
  today: string;
  locale: Locale;
  canManage: boolean;
  onViewRenewals: () => void;
  onMarkLost: () => void;
}): ReactElement {
  const t = useTranslations("app.library.memberHistory");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const renew = useRenewLoanMutation();
  const [open, setOpen] = useState(false);

  const urgency = classifyDueDate(loan.due_on, today);

  return (
    <li
      className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface px-3 py-2.5"
      data-urgency={urgency}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-[14px] font-medium text-fg">
          <LibraryTitleName titleId={loan.title_id} />
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <DueBadge dueOn={loan.due_on} today={today} locale={locale} />
          {loan.fine_amount > 0 && (
            <Badge variant="neutral">{formatCurrency(loan.fine_amount, "IDR", { locale })}</Badge>
          )}
        </div>
      </div>
      {canManage && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <IconButton icon={<MoreHorizontal />} aria-label={t("rowActions")} variant="outline" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                disabled={renew.isPending || urgency === "overdue"}
                title={urgency === "overdue" ? t("renewBlockedOverdue") : undefined}
                className="flex min-h-11 items-center gap-2 rounded-xs px-2 text-left text-[13px] text-fg hover:bg-bg disabled:pointer-events-none disabled:opacity-50"
                onClick={() => {
                  setOpen(false);
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
              >
                <RotateCw className="size-4" aria-hidden="true" />
                {t("renewAction")}
              </button>
              {loan.renewal_count > 0 && (
                <button
                  type="button"
                  className="flex min-h-11 items-center gap-2 rounded-xs px-2 text-left text-[13px] text-fg hover:bg-bg"
                  onClick={() => {
                    setOpen(false);
                    onViewRenewals();
                  }}
                >
                  <History className="size-4" aria-hidden="true" />
                  {t("renewals.viewHistory")}
                </button>
              )}
              <button
                type="button"
                className="flex min-h-11 items-center gap-2 rounded-xs px-2 text-left text-[13px] text-status-absent hover:bg-bg"
                onClick={() => {
                  setOpen(false);
                  onMarkLost();
                }}
              >
                <TriangleAlert className="size-4" aria-hidden="true" />
                {t("markLost")}
              </button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </li>
  );
}

export function loanRowSortKey(loan: LibraryLoan, today: string): number {
  return -overdueDays(loan.due_on, today);
}
