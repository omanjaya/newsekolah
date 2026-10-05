import type { LibraryLoan, LibraryReservation } from "../api";
import { classifyDueDate } from "../lib/due-date";

/** A reservation still worth showing on the "reservasi" tile: not yet fulfilled, cancelled, or expired. */
const ACTIVE_RESERVATION_STATUSES = new Set<LibraryReservation["status"]>(["waiting", "ready"]);

export interface MyLibraryTileCounts {
  activeLoans: number;
  /** The soonest `due_on` among the reader's active loans ("YYYY-MM-DD"), or `null` with no active loans. */
  nextDueOn: string | null;
  overdue: number;
  reservations: number;
}

/**
 * The four counts behind a student's "Perpustakaan saya" stat tiles
 * (docs/07-ui-ux.md bento): how many loans are active, the soonest due
 * date among them, how many are already overdue, and how many
 * reservations are still pending -- all derived from `GET /v1/library/me`,
 * never a second request.
 */
export function countMyLibraryTiles(
  activeLoans: readonly Pick<LibraryLoan, "due_on">[],
  reservations: readonly Pick<LibraryReservation, "status">[],
  today: string,
): MyLibraryTileCounts {
  const overdue = activeLoans.filter(
    (loan) => classifyDueDate(loan.due_on, today) === "overdue",
  ).length;

  const nextDueOn = activeLoans.reduce<string | null>((soonest, loan) => {
    if (soonest === null || loan.due_on < soonest) return loan.due_on;
    return soonest;
  }, null);

  const reservationsPending = reservations.filter((reservation) =>
    ACTIVE_RESERVATION_STATUSES.has(reservation.status),
  ).length;

  return {
    activeLoans: activeLoans.length,
    nextDueOn,
    overdue,
    reservations: reservationsPending,
  };
}
