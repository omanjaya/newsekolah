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
 * gate QR is then refused (EXIT_PERMIT_PERIOD_PASSED), and the permit waits
 * for the expiry job. False while the periods are unknown.
 */
export function usePermitLessonsOver(permit: { end_period_id: string } | undefined): boolean {
  const periods = usePeriodsQuery();
  const schoolTime = useSchoolTime();
  const end = periods.data?.data.find((p) => p.id === permit?.end_period_id);
  return end ? lessonEnded(end, schoolTime) : false;
}
