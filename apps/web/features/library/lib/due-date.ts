/**
 * Due-date urgency for a loan, shared by every screen that lists a
 * member's active loans (circulation desk overdue table, member detail,
 * a student's own "Pinjaman saya"): the same three buckets and the same
 * day-count everywhere, instead of each screen inventing its own "is this
 * late" check.
 */
export type DueUrgency = "ok" | "dueSoon" | "overdue";

/** A loan due within this many days (inclusive) counts as "due soon", not just "ok". */
const DUE_SOON_DAYS = 2;

/** Whole days between two "YYYY-MM-DD" calendar dates (`to` minus `from`), never as instants -- a due date has no time of day. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

/** `dueOn` classified against `today`, both "YYYY-MM-DD". */
export function classifyDueDate(dueOn: string, today: string): DueUrgency {
  const daysLeft = daysBetween(today, dueOn);
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= DUE_SOON_DAYS) return "dueSoon";
  return "ok";
}

/** Whole days a loan is overdue as of `today`; 0 when not overdue. */
export function overdueDays(dueOn: string, today: string): number {
  return Math.max(0, daysBetween(dueOn, today));
}
