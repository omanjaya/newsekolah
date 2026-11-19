import type { Locale } from "./translator.js";

export interface FormatOptions {
  locale: Locale;
  /** IANA timezone, e.g. "Asia/Jakarta". Defaults to the runtime's local zone. */
  timeZone?: string;
}

const INTL_LOCALE: Record<Locale, string> = { id: "id-ID", en: "en-US" };

/**
 * Short dates and day ranges read day first in both languages ("27 Nov",
 * "13 Jul 2026 – 18 Jun 2027"), so an English row and an Indonesian one
 * line up the same way and every list in the app agrees.
 */
const SHORT_DATE_LOCALE: Record<Locale, string> = { id: "id-ID", en: "en-GB" };

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A value and the zone to read it in. A calendar date ("2026-07-13", a
 * due date or a term's first day) has no time of day: it is that day for
 * everyone, so it is placed at UTC midnight and read in UTC. An instant
 * is read in the school's zone.
 */
function placed(
  value: Date | string | number,
  timeZone: string | undefined,
): { date: Date; timeZone: string | undefined } {
  if (typeof value === "string" && CALENDAR_DATE.test(value)) {
    return { date: new Date(`${value}T00:00:00Z`), timeZone: "UTC" };
  }
  return { date: toDate(value), timeZone };
}

/** "9 September 2026" (id) / "September 9, 2026" (en). */
export function formatDate(value: Date | string | number, options: FormatOptions): string {
  const { date, timeZone } = placed(value, options.timeZone);
  return new Intl.DateTimeFormat(INTL_LOCALE[options.locale], {
    dateStyle: "long",
    timeZone,
  }).format(date);
}

function yearIn(date: Date, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone }).format(date);
}

/**
 * A date as a stat hint or a list row has room for: "27 Nov" in both
 * languages, with the year only outside the current one ("3 Jan 2027").
 * `now` is the moment "the current year" is read from (defaults to now,
 * in `timeZone`).
 */
export function formatShortDate(
  value: Date | string | number,
  options: FormatOptions & { now?: Date },
): string {
  const { date, timeZone } = placed(value, options.timeZone);
  const currentYear = yearIn(options.now ?? new Date(), options.timeZone);
  return (
    new Intl.DateTimeFormat(SHORT_DATE_LOCALE[options.locale], {
      day: "numeric",
      month: "short",
      year: yearIn(date, timeZone) === currentYear ? undefined : "numeric",
      timeZone,
    })
      .format(date)
      // Some ICU builds end an abbreviated month with a period ("Sep.").
      .replace(/\.$/, "")
  );
}

/**
 * A span of days said once, joined by an en dash: "13 Jul 2026 – 18 Jun
 * 2027", "13–20 Jul 2026", or "13 Jul 2026" when both ends are the same
 * day (Intl's own range format, so each locale joins them its own way).
 * Both ends are calendar dates or both are instants.
 */
export function formatDateRange(
  from: Date | string | number,
  to: Date | string | number,
  options: FormatOptions,
): string {
  const start = placed(from, options.timeZone);
  const end = placed(to, options.timeZone);
  const format = new Intl.DateTimeFormat(SHORT_DATE_LOCALE[options.locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: start.timeZone,
  });
  if (end.date.getTime() <= start.date.getTime()) return format.format(start.date);
  return format.formatRange(start.date, end.date);
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
