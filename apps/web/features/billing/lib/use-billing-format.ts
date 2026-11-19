"use client";

import { type Locale, formatCurrency, formatDate } from "@newsekolah/i18n";
import { useLocale } from "next-intl";
import { useMemo } from "react";

import { formatBillPeriod } from "./bill-period";

export interface BillingFormat {
  money: (amountMinor: number, currency?: string) => string;
  day: (isoDate: string) => string;
  /** A bill's period: a monthly key as its month, a one-off label as typed. */
  period: (period: string) => string;
}

/**
 * The billing screens' formats: money ("Rp 1.500.000", whole rupiah, as
 * the module stores it), a calendar date such as a due date or a paid-on
 * date, which the API sends as a bare "YYYY-MM-DD" and so is read in UTC to
 * stay on its own day, and a bill's period (`formatBillPeriod`). Stable per
 * locale, so table columns built from it are not rebuilt on every render.
 */
export function useBillingFormat(): BillingFormat {
  const locale = useLocale() as Locale;
  return useMemo(
    () => ({
      money: (amountMinor, currency = "IDR") => formatCurrency(amountMinor, currency, { locale }),
      day: (isoDate) => formatDate(isoDate, { locale, timeZone: "UTC" }),
      period: (period) => formatBillPeriod(period, locale),
    }),
    [locale],
  );
}
