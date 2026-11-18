"use client";

import { formatDate, formatDateTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  Skeleton,
  List,
  ListRow,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useLibraryLoanRenewalsQuery } from "../api";
import { useTenantTimeZone } from "../use-tenant-timezone";

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
  const timeZone = useTenantTimeZone();
  const renewals = useLibraryLoanRenewalsQuery(loanId ?? "");
  const items = renewals.data?.data ?? [];

  return (
    <Dialog open={loanId !== null} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("title")}
        footer={
          <DialogClose asChild>
            <Button variant="secondary">{t("close")}</Button>
          </DialogClose>
        }
      >
        {renewals.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : items.length === 0 ? (
          <p className="text-body-sm text-fg-muted">{t("empty")}</p>
        ) : (
          <List framed aria-label={t("title")}>
            {items.map((renewal) => (
              <ListRow
                key={renewal.id}
                title={formatDateTime(renewal.renewed_at, { locale, timeZone })}
                meta={t("dueChange", {
                  previous: formatDate(renewal.previous_due_on, { locale }),
                  next: formatDate(renewal.new_due_on, { locale }),
                })}
              />
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
}
