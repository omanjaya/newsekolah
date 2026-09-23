"use client";

import { formatDate, formatDateTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Button, Dialog, DialogClose, DialogContent, Skeleton } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useLibraryLoanRenewalsQuery } from "../api";

/** Renewal history for one loan, shared by any screen that lists loan rows. */
export function LoanRenewalsDialog({
  loanId,
  onOpenChange,
}: {
  loanId: string | null;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.library.memberHistory.renewals");
  const locale = useLocale() as Locale;
  const renewals = useLibraryLoanRenewalsQuery(loanId ?? "");
  const items = renewals.data?.data ?? [];

  return (
    <Dialog open={loanId !== null} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("title")}
        footer={
          <DialogClose asChild>
            <Button variant="secondary" size="sm">
              {t("close")}
            </Button>
          </DialogClose>
        }
      >
        {renewals.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : items.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-[13px]">
            {items.map((renewal) => (
              <li key={renewal.id} className="rounded-sm border border-border bg-surface p-2">
                <p className="text-fg">{formatDateTime(renewal.renewed_at, { locale })}</p>
                <p className="text-fg-muted">
                  {t("dueChange", {
                    previous: formatDate(renewal.previous_due_on, { locale }),
                    next: formatDate(renewal.new_due_on, { locale }),
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
