/**
 * 24-hour "HH:mm" times of day, handled as minutes since midnight. The
 * stored value always uses ":"; what a person sees uses the locale's own
 * separator ("08.30" in Indonesian, "08:30" in English).
 */

const MINUTES_PER_DAY = 24 * 60;
const STORED_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since midnight for a stored "HH:mm" value, or null. */
export function parseTime(value: string | null | undefined): number | null {
  const match = value ? STORED_TIME.exec(value) : null;
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function toTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function minutesOf(hours: number, minutes: number): number | null {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Reads what someone typed: "8" and "08" are 08:00, "830" and "0830" are
 * 08:30, and "8:30", "8.30" or "8,30" are 08:30 too, whatever the
 * separator. Returns null for anything that is not a valid time.
 */
export function parseTypedTime(text: string): number | null {
  const compact = text.trim().replace(/\s+/g, "");
  if (compact === "") return null;
  const separated = /^(\d{1,2})[:.,hH](\d{1,2})$/.exec(compact);
  if (separated) return minutesOf(Number(separated[1]), Number(separated[2]));
  if (!/^\d{1,4}$/.test(compact)) return null;
  if (compact.length <= 2) return minutesOf(Number(compact), 0);
  const hours = compact.slice(0, compact.length - 2);
  return minutesOf(Number(hours), Number(compact.slice(-2)));
}

const separators = new Map<string, string>();

/** The hour/minute separator the locale writes: "." for id-ID, ":" for en. */
export function timeSeparator(locale: string): string {
  let separator = separators.get(locale);
  if (separator === undefined) {
    const parts = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "UTC",
    }).formatToParts(new Date(Date.UTC(2024, 0, 1, 8, 30)));
    separator = parts.find((part) => part.type === "literal")?.value.trim() ?? ":";
    separators.set(locale, separator);
  }
  return separator;
}

export function formatTime(minutes: number, locale: string): string {
  return toTime(minutes).replace(":", timeSeparator(locale));
}

export function clampMinutes(minutes: number, min: number | null, max: number | null): number {
  if (min !== null && minutes < min) return min;
  if (max !== null && minutes > max) return max;
  return minutes;
}

/** Every `step` minutes from midnight that falls within [min, max]. */
export function timeSteps(step: number, min: number | null, max: number | null): number[] {
  const safeStep = Math.max(1, Math.floor(step));
  const steps: number[] = [];
  for (let minutes = 0; minutes < MINUTES_PER_DAY; minutes += safeStep) {
    if ((min === null || minutes >= min) && (max === null || minutes <= max)) steps.push(minutes);
  }
  return steps;
}
