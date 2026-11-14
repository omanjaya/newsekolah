"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatCurrency } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Badge, Card, IconCircle, RowActionsMenu, useToast } from "@newsekolah/ui";
import { BookOpen, History, RotateCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type LibraryLoan, useRenewLoanMutation } from "../api";
import { classifyDueDate, overdueDays } from "../lib/due-date";

import { DueBadge } from "./due-badge";
import { LibraryTitleName } from "./library-title-name";

/**
 * One current loan on a member's profile, as a card row: the title, how
 * urgent its due date is, any fine, and (for library staff) Perpanjang,
 * the renewal history and Tandai hilang in the row's menu. Renewing an
 * overdue loan is refused by the library, so that item is disabled and
 * the reason shows under the row instead of hiding in a tooltip.
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

  const urgency = classifyDueDate(loan.due_on, today);
  const overdue = urgency === "overdue";

  return (
    <Card asChild padding="sm">
      <li className="flex-row items-center gap-3" data-urgency={urgency}>
        <IconCircle tone={overdue ? "danger" : "accent"}>
          <BookOpen />
        </IconCircle>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate text-body font-semibold text-fg">
            <LibraryTitleName titleId={loan.title_id} />
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <DueBadge dueOn={loan.due_on} today={today} locale={locale} />
            {loan.fine_amount > 0 && (
              <Badge tone="warning">{formatCurrency(loan.fine_amount, "IDR", { locale })}</Badge>
            )}
          </div>
          {canManage && overdue && (
            <span className="text-caption text-fg-muted">
              {t("renewBlockedOverdueDays", { days: overdueDays(loan.due_on, today) })}
            </span>
          )}
        </div>
        {canManage && (
          <RowActionsMenu
            ariaLabel={t("rowActions")}
            items={[
              {
                label: t("renewAction"),
                icon: <RotateCw className="size-4" aria-hidden="true" />,
                disabled: renew.isPending || overdue,
                onClick: () => {
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
                },
              },
              ...(loan.renewal_count > 0
                ? [
                    {
                      label: t("renewals.viewHistory"),
                      icon: <History className="size-4" aria-hidden="true" />,
                      onClick: onViewRenewals,
                    },
                  ]
                : []),
              {
                label: t("markLost"),
                icon: <TriangleAlert className="size-4" aria-hidden="true" />,
                tone: "danger" as const,
                onClick: onMarkLost,
              },
            ]}
          />
        )}
      </li>
    </Card>
  );
}

export function loanRowSortKey(loan: LibraryLoan, today: string): number {
  return -overdueDays(loan.due_on, today);
}
