import { type Locale, formatMonth } from "@newsekolah/i18n";

const MONTHLY_PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * A bill's period as people read it. A monthly fee's period is the machine
 * key "YYYY-MM" (billing/domain/feetype.go), shown as its month ("November
 * 2026"); a one-off fee's period is the label the admin typed for it, shown
 * as it is.
 */
export function formatBillPeriod(period: string, locale: Locale): string {
  if (!MONTHLY_PERIOD.test(period)) return period;
  return formatMonth(`${period}-01`, { locale, timeZone: "UTC" });
}
