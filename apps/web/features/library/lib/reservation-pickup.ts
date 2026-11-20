import type { components } from "@newsekolah/api-client";

type ReservationStatus = components["schemas"]["LibraryReservationStatus"];

/** The parts of a reservation its status line reads. */
export interface PickupHold {
  status: ReservationStatus;
  expires_at?: string;
}

/**
 * A ready hold whose pickup deadline has passed has lapsed: the member can
 * no longer collect it. The server's expiry job releases it on its next
 * run, so until then the row would still say "ready" without this.
 */
export function isLapsedHold(hold: PickupHold, now: Date): boolean {
  return (
    hold.status === "ready" &&
    hold.expires_at !== undefined &&
    Date.parse(hold.expires_at) <= now.getTime()
  );
}

/** The status a reservation row shows: a lapsed hold reads "expired". */
export function shownReservationStatus(hold: PickupHold, now: Date): ReservationStatus {
  return isLapsedHold(hold, now) ? "expired" : hold.status;
}
