"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Button, Card, cn, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import type { LibraryLoan } from "../api";
import { classifyDueDate } from "../lib/due-date";
import { useRenewMyLoanMutation } from "../me-api";

import { DueBadge } from "./due-badge";

/**
 * One of the reader's own active loans, as a bento card (docs/07-ui-ux.md):
 * title, author, the due-date urgency badge, and a Perpanjang button --
 * the one action this card needs, so it stays a visible button rather than
 * a "..." menu for just one item.
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

  const urgency = classifyDueDate(loan.due_on, today);
  const canRenew = urgency !== "overdue";

  return (
    <Card className={cn("flex h-full flex-col justify-between gap-3 p-4", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate text-[15px] font-medium text-fg">
          {loan.title_name ?? loan.title_id}
        </p>
        {loan.title_author && (
          <p className="truncate text-[13px] text-fg-muted">{loan.title_author}</p>
        )}
        <DueBadge dueOn={loan.due_on} today={today} locale={locale} className="mt-1" />
      </div>
      <Button
        size="sm"
        variant="secondary"
        loading={renew.isPending}
        disabled={!canRenew}
        title={canRenew ? undefined : t("renewBlockedOverdue")}
        className="self-start"
        onClick={() => {
          renew.mutate(loan.id, {
            onSuccess: (result) => {
              toast.success(t("renewed", { date: formatDate(result.due_on, { locale }) }));
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
    </Card>
  );
}
