"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Button, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import type { LibraryLoan } from "../api";
import { classifyDueDate } from "../lib/due-date";
import { useRenewMyLoanMutation } from "../me-api";

import { DueBadge } from "./due-badge";
import { LibraryTitleName } from "./library-title-name";

/** One of the reader's own active loans: title, due-date urgency, and a Perpanjang button -- the one action this row needs, so it stays a visible button rather than a "..." menu for just one item. */
export function MyLibraryLoanRow({
  loan,
  today,
  locale,
}: {
  loan: LibraryLoan;
  today: string;
  locale: Locale;
}): ReactElement {
  const t = useTranslations("app.library.me");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const renew = useRenewMyLoanMutation();

  const urgency = classifyDueDate(loan.due_on, today);
  const canRenew = urgency !== "overdue";

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-[13px] text-fg">
          <LibraryTitleName titleId={loan.title_id} />
        </span>
        <DueBadge dueOn={loan.due_on} today={today} locale={locale} />
      </div>
      <Button
        size="sm"
        variant="secondary"
        loading={renew.isPending}
        disabled={!canRenew}
        title={canRenew ? undefined : t("renewBlockedOverdue")}
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
    </li>
  );
}
