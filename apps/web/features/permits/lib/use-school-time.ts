import { useSession } from "../../../lib/session/session-provider";
import { useBusinessNow } from "../../../lib/simulation/clock";
import { isoToZonedLocal } from "../../../lib/tenant-date";
import { usePeriodsQuery } from "../../reference/api";

import { lessonEnded } from "./lesson-period-options";

/** The school's wall clock now, "HH:mm" (the simulated one under the time simulation). */
export function useSchoolTime(): string {
  const { me } = useSession();
  return isoToZonedLocal(useBusinessNow(), me?.tenant.timezone).slice(11, 16);
}

/**
 * Whether an exit permit's last lesson has ended on the school's clock: its
 * stages and gate QR are then refused (EXIT_PERMIT_WINDOW_CLOSED), and the
 * permit waits for the expiry job. A permit opened on an earlier school day
 * is over whatever the time now, as the API reads it (the permit's own
 * local day). False while the periods are unknown.
 */
export function usePermitLessonsOver(
  permit: { end_period_id: string; instance: { opened_at: string } } | undefined,
): boolean {
  const { me } = useSession();
  const now = useBusinessNow();
  const periods = usePeriodsQuery();
  if (!permit) return false;
  const timeZone = me?.tenant.timezone;
  const today = isoToZonedLocal(now, timeZone);
  if (isoToZonedLocal(permit.instance.opened_at, timeZone).slice(0, 10) < today.slice(0, 10)) {
    return true;
  }
  const end = periods.data?.data.find((p) => p.id === permit.end_period_id);
  return end ? lessonEnded(end, today.slice(11, 16)) : false;
}
