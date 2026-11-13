/**
 * Calendar-date arithmetic on ISO "YYYY-MM-DD" and "YYYY-MM" strings, the
 * form every date field and the API exchange.
 *
 * A calendar date is not an instant, so nothing here parses a string into a
 * `Date`: `new Date("2026-11-14")` is UTC midnight, which is still the 13th
 * west of Greenwich. Dates are split into numeric parts and converted with
 * `Date.UTC` (no parsing, no local zone) only where a day count or an `Intl`
 * formatter needs one, and the formatter then runs with `timeZone: "UTC"`.
 */

export interface IsoDateParts {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
}

export interface IsoMonthParts {
  year: number;
  /** 1 to 12. */
  month: number;
}

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The parts of a valid ISO date, or null for anything else (including "2026-02-30"). */
export function parseIsoDate(value: string | null | undefined): IsoDateParts | null {
  const match = value ? ISO_DATE.exec(value) : null;
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isIsoDate(value: string | null | undefined): value is string {
  return parseIsoDate(value) !== null;
}

/**
 * A date prop read as a calendar date: "YYYY-MM-DD" as it is, a timestamp
 * as the date it is written with ("2026-11-14T00:00:00Z" is 2026-11-14),
 * anything else as unset. A bound in the wrong shape then cannot leave a
 * grid with no day to focus.
 */
export function normalizeIsoDate(value: string | null | undefined): string | undefined {
  const date = value?.slice(0, 10);
  return isIsoDate(date) ? date : undefined;
}

export function toIsoDate({ year, month, day }: IsoDateParts): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function dayNumber(iso: string): number {
  const parts = parseIsoDate(iso);
  if (!parts) throw new RangeError(`Not an ISO date: ${iso}`);
  return Date.UTC(parts.year, parts.month - 1, parts.day) / MS_PER_DAY;
}

function fromDayNumber(days: number): string {
  const date = new Date(days * MS_PER_DAY);
  return toIsoDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(dayNumber(iso) + days);
}

/** Moves by whole months, keeping the day where the target month has it (31 Jan + 1 = 28/29 Feb). */
export function addMonths(iso: string, months: number): string {
  const parts = parseIsoDate(iso);
  if (!parts) throw new RangeError(`Not an ISO date: ${iso}`);
  const index = parts.year * 12 + (parts.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return toIsoDate({ year, month, day: Math.min(parts.day, daysInMonth(year, month)) });
}

/** 0 for Monday through 6 for Sunday: school weeks start on Senin. */
export function weekdayIndex(iso: string): number {
  // Day 0 (1970-01-01) was a Thursday, index 3.
  return (((dayNumber(iso) + 3) % 7) + 7) % 7;
}

export function startOfWeek(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}

export function endOfWeek(iso: string): string {
  return addDays(iso, 6 - weekdayIndex(iso));
}

/** Zero-padded ISO strings order lexically, so plain comparison is chronological. */
export function compareIsoDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function clampIsoDate(iso: string, min?: string, max?: string): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

export function isWithinIsoRange(iso: string, min?: string, max?: string): boolean {
  return (!min || iso >= min) && (!max || iso <= max);
}

/** The device's local calendar date. Only a fallback: callers pass the school's "today". */
export function localTodayIso(now: Date = new Date()): string {
  return toIsoDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}

export function parseIsoMonth(value: string | null | undefined): IsoMonthParts | null {
  const match = value ? ISO_MONTH.exec(value) : null;
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** A month prop read as "YYYY-MM" (a full date counts as its month), or unset for anything else. */
export function normalizeIsoMonth(value: string | null | undefined): string | undefined {
  const month = value?.slice(0, 7);
  return parseIsoMonth(month) ? month : undefined;
}

export function toIsoMonth({ year, month }: IsoMonthParts): string {
  return `${pad(year, 4)}-${pad(month)}`;
}

export function isoMonthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function addIsoMonths(isoMonth: string, months: number): string {
  return isoMonthOf(addMonths(`${isoMonth}-01`, months));
}

/**
 * Six Monday-first weeks covering `isoMonth`, padded with the neighbouring
 * months' days. Always six rows, so a popover does not change height from
 * one month to the next.
 */
export function monthWeeks(isoMonth: string): string[][] {
  const first = startOfWeek(`${isoMonth}-01`);
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(first, week * 7 + day)),
  );
}

/** A `Date` for `Intl` only: always format it with `timeZone: "UTC"`. */
export function isoDateToUtc(iso: string): Date {
  return new Date(dayNumber(iso) * MS_PER_DAY);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
    formatters.set(key, cached);
  }
  return cached;
}

export const LONG_DATE: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
};

/** "14 November 2026" for id-ID with the default options. */
export function formatIsoDate(
  iso: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = LONG_DATE,
): string {
  return formatter(locale, options).format(isoDateToUtc(iso));
}

/** "1–14 Nov 2026", "20 Okt – 14 Nov 2026": the locale collapses what both ends share. */
export function formatIsoDateRange(
  from: string,
  to: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = LONG_DATE,
): string {
  const format = formatter(locale, options);
  return format.formatRange(isoDateToUtc(from), isoDateToUtc(to));
}

/** "November 2026". */
export function formatIsoMonth(
  isoMonth: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" },
): string {
  return formatIsoDate(`${isoMonth}-01`, locale, options);
}

/** Monday-first weekday names, e.g. "Sen" ... "Min" for id-ID with "short". */
export function weekdayNames(locale: string, width: "short" | "long" | "narrow"): string[] {
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, index) =>
    formatIsoDate(addDays("2024-01-01", index), locale, { weekday: width }),
  );
}

/** January-first month names, e.g. "Jan" ... "Des" for id-ID with "short". */
export function monthNames(locale: string, width: "short" | "long"): string[] {
  return Array.from({ length: 12 }, (_, index) =>
    formatIsoDate(toIsoDate({ year: 2024, month: index + 1, day: 1 }), locale, { month: width }),
  );
}
