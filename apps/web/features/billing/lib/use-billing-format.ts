"use client";

import { type Locale, formatCurrency, formatDate } from "@newsekolah/i18n";
import { useLocale } from "next-intl";
import { useMemo } from "react";

export interface BillingFormat {
  money: (amountMinor: number, currency?: string) => string;
  day: (isoDate: string) => string;
}

/**
 * The billing screens' two formats: money ("Rp 1.500.000", whole rupiah,
 * as the module stores it) and a calendar date such as a due date or a
 * paid-on date, which the API sends as a bare "YYYY-MM-DD" and so is read
 * in UTC to stay on its own day. Stable per locale, so table columns built
 * from it are not rebuilt on every render.
 */
export function useBillingFormat(): BillingFormat {
  const locale = useLocale() as Locale;
  return useMemo(
    () => ({
      money: (amountMinor, currency = "IDR") => formatCurrency(amountMinor, currency, { locale }),
      day: (isoDate) => formatDate(isoDate, { locale, timeZone: "UTC" }),
    }),
    [locale],
  );
}
