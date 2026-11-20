import { useSession } from "../../../lib/session/session-provider";
import { useBusinessNow } from "../../../lib/simulation/clock";
import { isoToZonedLocal } from "../../../lib/tenant-date";
import { usePeriodsQuery } from "../../reference/api";

import { permitLessonsOver } from "./lesson-period-options";

/** The school's wall clock now, "HH:mm" (the simulated one under the time simulation). */
export function useSchoolTime(): string {
  const { me } = useSession();
  return isoToZonedLocal(useBusinessNow(), me?.tenant.timezone).slice(11, 16);
}

/**
 * Whether an exit permit's last lesson has ended on the school's clock
 * (`permitLessonsOver`), re-read as the clock moves. False while the
 * periods are unknown.
 */
export function usePermitLessonsOver(
  permit: { end_period_id: string; instance: { opened_at: string } } | undefined,
): boolean {
  const { me } = useSession();
  const now = useBusinessNow();
  const periods = usePeriodsQuery();
  if (!permit) return false;
  return permitLessonsOver(
    { end_period_id: permit.end_period_id, opened_at: permit.instance.opened_at },
    periods.data?.data,
    now,
    me?.tenant.timezone,
  );
}
