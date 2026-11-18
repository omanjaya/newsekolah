import { instantFromSchoolTime, schoolDateTime } from "../../../lib/simulation/clock";
import { toDateTimeLocalValue } from "../../../lib/tenant-date";

/** An instant as the school's calendar date ("YYYY-MM-DD") and wall clock ("HH:mm"). */
export function splitInstant(instant: Date, timeZone?: string): { date: string; time: string } {
  if (timeZone) return schoolDateTime(instant, timeZone);
  const local = toDateTimeLocalValue(instant);
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

/** The instant a school date and time stand for, or null when either is missing or invalid. */
export function joinInstant(date: string, time: string, timeZone?: string): Date | null {
  if (date === "" || time === "") return null;
  if (timeZone) return instantFromSchoolTime(date, time, timeZone);
  const local = new Date(`${date}T${time}`);
  return Number.isNaN(local.getTime()) ? null : local;
}
