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
 * A day named with its weekday, for a sentence that points at another day
 * than today: "Sabtu, 21 Nov" (id) / "Saturday 21 Nov" (en), the year only
 * outside the current one, like `formatShortDate`.
 */
export function formatWeekdayDate(
  value: Date | string | number,
  options: FormatOptions & { now?: Date },
): string {
  const { date, timeZone } = placed(value, options.timeZone);
  const currentYear = yearIn(options.now ?? new Date(), options.timeZone);
  return new Intl.DateTimeFormat(SHORT_DATE_LOCALE[options.locale], {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: yearIn(date, timeZone) === currentYear ? undefined : "numeric",
    timeZone,
  })
    .format(date)
    .replace(/\.$/, "");
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

/** "September 2026" (id and en): a month as a whole, such as a billing period. */
export function formatMonth(value: Date | string | number, options: FormatOptions): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[options.locale], {
    month: "long",
    year: "numeric",
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

/**
 * An instant as a dense list row has room for: `formatShortDate` then
 * `formatTime`, "19 Nov 16.32" (id) / "19 Nov 4:32 PM" (en), with the year
 * only outside the current one ("19 Nov 2025 16.32"). Both halves are read
 * in `timeZone`.
 */
export function formatShortDateTime(
  value: Date | string | number,
  options: FormatOptions & { now?: Date },
): string {
  const instant = toDate(value);
  return `${formatShortDate(instant, options)} ${formatTime(instant, options)}`;
}

/** "9 September 2026 pukul 14.05" (id) / "September 9, 2026 at 2:05 PM" (en). */
export function formatDateTime(
  value: Date | string | number,
  options: FormatOptions & {
    /**
     * Name the zone after the time ("pukul 10.02 WITA"), for a page read
     * by someone who may be in another zone than the school (a public
     * verification page). Off by default: inside the app every time is
     * already the school's.
     */
    withZone?: boolean;
  },
): string {
  const date = toDate(value);
  const text = new Intl.DateTimeFormat(INTL_LOCALE[options.locale], {
    dateStyle: "long",
    timeStyle: "short",
    hourCycle: options.locale === "id" ? "h23" : undefined,
    timeZone: options.timeZone,
  }).format(date);
  if (!options.withZone) return text;
  const zone = formatTimeZoneName(date, options);
  return zone ? `${text} ${zone}` : text;
}

/**
 * The short name of the zone a moment is read in: "WIB", "WITA" or "WIT"
 * in Indonesian, "GMT+7" style in English. Empty when the runtime has no
 * name for it.
 */
export function formatTimeZoneName(value: Date | string | number, options: FormatOptions): string {
  return (
    new Intl.DateTimeFormat(INTL_LOCALE[options.locale], {
      timeZone: options.timeZone,
      timeZoneName: "short",
    })
      .formatToParts(toDate(value))
      .find((part) => part.type === "timeZoneName")?.value ?? ""
  );
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

export interface NumberFormatOptions {
  locale: Locale;
  /**
   * Exactly this many decimals, e.g. 1 for a grade average ("78,5" in id,
   * "78.5" in en). Omitted, the number keeps the decimals it has (up to
   * Intl's default of three).
   */
  fractionDigits?: number;
  /**
   * A range instead of an exact count, e.g. 1 and 2 for a score kept to
   * two decimals ("88,0", "77,55"). Ignored when `fractionDigits` is set.
   */
  minFractionDigits?: number;
  maxFractionDigits?: number;
}

/**
 * Locale-aware number formatting, e.g. for table cells with tabular
 * figures. Use it instead of `toFixed`, which always writes a decimal
 * point, wrong in the Indonesian UI.
 */
export function formatNumber(value: number, options: NumberFormatOptions): string {
  const { fractionDigits, minFractionDigits, maxFractionDigits } = options;
  let digits: Intl.NumberFormatOptions | undefined;
  if (fractionDigits !== undefined) {
    digits = { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits };
  } else if (minFractionDigits !== undefined || maxFractionDigits !== undefined) {
    const max = maxFractionDigits ?? Math.max(minFractionDigits ?? 0, 3);
    digits = {
      minimumFractionDigits: Math.min(minFractionDigits ?? 0, max),
      maximumFractionDigits: max,
    };
  }
  return new Intl.NumberFormat(INTL_LOCALE[options.locale], digits).format(value);
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
