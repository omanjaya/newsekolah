"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { Button, Card, IconCircle, cn, useToast } from "@newsekolah/ui";
import { BookOpen, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import type { LibraryLoan } from "../api";
import { classifyDueDate } from "../lib/due-date";
import { formatShortDay } from "../lib/short-date";
import { useRenewMyLoanMutation } from "../me-api";

import { DueBadge } from "./due-badge";

/**
 * One of the reader's own books out, as a card row: title, author, the
 * due-date badge and a Perpanjang button, the one action this row needs.
 * When renewing is refused (the loan is already late) the button stays
 * disabled and the reason is written under it, where a touch screen
 * shows it, not in a tooltip.
 */
export function MyLibraryLoanRow({
  loan,
  today,
  locale,
  className,
}: {
  loan: LibraryLoan;
  today: string;
  locale: Locale;
  className?: string;
}): ReactElement {
  const t = useTranslations("app.library.me");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const renew = useRenewMyLoanMutation();

  const overdue = classifyDueDate(loan.due_on, today) === "overdue";

  return (
    <Card asChild padding="sm">
      <li className={cn("flex-row items-start gap-3", className)}>
        <IconCircle tone={overdue ? "danger" : "accent"}>
          <BookOpen />
        </IconCircle>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-body font-semibold text-fg [overflow-wrap:anywhere]">
              {loan.title_name ?? t("titleUnavailable")}
            </p>
            {loan.title_author && <p className="text-body-sm text-fg-muted">{loan.title_author}</p>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DueBadge dueOn={loan.due_on} today={today} locale={locale} />
            <Button
              size="sm"
              variant="secondary"
              icon={<RotateCw />}
              loading={renew.isPending}
              disabled={overdue}
              onClick={() => {
                renew.mutate(loan.id, {
                  onSuccess: (result) => {
                    toast.success(
                      t("renewed", { date: formatShortDay(result.due_on, locale, { today }) }),
                    );
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
              {t("renewAction")}
            </Button>
          </div>
          {overdue && <p className="text-caption text-fg-muted">{t("renewBlockedOverdue")}</p>}
        </div>
      </li>
    </Card>
  );
}
