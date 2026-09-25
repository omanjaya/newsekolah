"use client";

import { queryKeys } from "@newsekolah/api-client";

import { useLiveInvalidate } from "../../lib/realtime/use-live-invalidate";
import { useLiveTopic } from "../../lib/realtime/use-live-topic";
import { useSession } from "../../lib/session/session-provider";

/**
 * `staff_attendance.scanned` -> `role:<tenant>:admin` + `role:<tenant>:principal`
 * (docs/analysis/realtime-plan-2026-09-25.md section 4.4 row 12, corrected
 * from a never-existing `role:hr` + `duty:duty_teacher`): today's staff
 * attendance board (plan section 2 row 8), which polls every 60 seconds.
 */
export function useStaffAttendanceTodayLive(date: string): void {
  const { me } = useSession();
  const holdsAdminRole = (me?.roles ?? []).some((role) => role.slug === "admin");
  const holdsPrincipalRole = (me?.roles ?? []).some((role) => role.slug === "principal");
  const enabled = date !== "";
  useLiveTopic(enabled && holdsAdminRole ? "role:admin" : undefined);
  useLiveTopic(enabled && holdsPrincipalRole ? "role:principal" : undefined);
  useLiveInvalidate(["staff_attendance.scanned"], [queryKeys.staffAttendanceToday(date)]);
}
