import type { Locale } from "./translator.js";

export interface FormatOptions {
  locale: Locale;
  /** IANA timezone, e.g. "Asia/Jakarta". Defaults to the runtime's local zone. */
  timeZone?: string;
}

const INTL_LOCALE: Record<Locale, string> = { id: "id-ID", en: "en-US" };

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "9 September 2026" (id) / "September 9, 2026" (en). */
export function formatDate(value: Date | string | number, options: FormatOptions): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[options.locale], {
    dateStyle: "long",
    timeZone: options.timeZone,
  }).format(toDate(value));
}

/** "14.05" (id, 24-hour) / "2:05 PM" (en). */
export function formatTime(value: Date | string | number, options: FormatOptions): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[options.locale], {
    timeStyle: "short",
    hourCycle: options.locale === "id" ? "h23" : undefined,
    timeZone: options.timeZone,
  }).format(toDate(value));
}

/** "9 September 2026 pukul 14.05" (id) / "September 9, 2026 at 2:05 PM" (en). */
export function formatDateTime(value: Date | string | number, options: FormatOptions): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[options.locale], {
    dateStyle: "long",
    timeStyle: "short",
    hourCycle: options.locale === "id" ? "h23" : undefined,
    timeZone: options.timeZone,
  }).format(toDate(value));
}

const RELATIVE_UNITS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: "hour", seconds: 3600 },
  { unit: "minute", seconds: 60 },
];

/**
 * Relative time ("2 jam lalu") for differences under 24 hours, per
 * docs/07-ui-ux.md section 5; otherwise falls back to an absolute
 * `formatDateTime` so old events don't render as misleading "x days ago".
 */
export function formatRelative(
  value: Date | string | number,
  options: FormatOptions & { now?: Date },
): string {
  const target = toDate(value);
  const now = options.now ?? new Date();
  const diffSeconds = Math.round((target.getTime() - now.getTime()) / 1000);
  const absDiffSeconds = Math.abs(diffSeconds);

  if (absDiffSeconds < 60) {
    return new Intl.RelativeTimeFormat(INTL_LOCALE[options.locale], { numeric: "auto" }).format(
      0,
      "second",
    );
  }

  if (absDiffSeconds >= 24 * 3600) {
    return formatDateTime(target, options);
  }

  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALE[options.locale], { numeric: "auto" });
  for (const { unit, seconds } of RELATIVE_UNITS) {
    if (absDiffSeconds >= seconds) {
      return rtf.format(Math.round(diffSeconds / seconds), unit);
    }
  }
  return rtf.format(Math.round(diffSeconds / 60), "minute");
}

/** Locale-aware number formatting, e.g. for table cells with tabular figures. */
export function formatNumber(value: number, options: FormatOptions): string {
  return new Intl.NumberFormat(INTL_LOCALE[options.locale]).format(value);
}

/**
 * Locale-aware money formatting for an integer amount already in the
 * currency's smallest unit ("Rp 250.000" for 250000 IDR minor units).
 * Rupiah has no subunit in everyday use, so this always renders a whole
 * number with `maximumFractionDigits: 0` regardless of currency, matching
 * how the billing module stores every amount (docs/04-clean-code.md:
 * money is an integer, never a float, so its display never invents
 * fraction digits the source data does not have).
 */
export function formatCurrency(
  amountMinor: number,
  currency: string,
  options: FormatOptions,
): string {
  return new Intl.NumberFormat(INTL_LOCALE[options.locale], {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amountMinor);
}
