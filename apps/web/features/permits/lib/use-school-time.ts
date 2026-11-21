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

type LessonsPermit = { end_period_id: string; instance: { opened_at: string } } | undefined;

/**
 * Whether an exit permit's last lesson has ended on the school's clock
 * (`permitLessonsOver`), re-read as the clock moves. False while the
 * periods are unknown.
 */
export function usePermitLessonsOver(permit: LessonsPermit): boolean {
  return usePermitLessons(permit).over;
}

/**
 * `usePermitLessonsOver`, and whether that answer is settled: `known` stays
 * false while the periods of a permit from today are still loading, so a
 * caller can hold back what it would only do for a permit still running.
 * A failed periods read counts as settled (not over); the API still
 * refuses a permit whose lessons are over.
 */
export function usePermitLessons(permit: LessonsPermit): { over: boolean; known: boolean } {
  const { me } = useSession();
  const now = useBusinessNow();
  const periods = usePeriodsQuery(permit !== undefined);
  if (!permit) return { over: false, known: false };
  const over = permitLessonsOver(
    { end_period_id: permit.end_period_id, opened_at: permit.instance.opened_at },
    periods.data?.data,
    now,
    me?.tenant.timezone,
  );
  return { over, known: over || !periods.isPending };
}
