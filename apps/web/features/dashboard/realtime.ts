"use client";

import { queryKeys } from "@newsekolah/api-client";

import { useLiveInvalidate } from "../../lib/realtime/use-live-invalidate";
import { useLiveTopic } from "../../lib/realtime/use-live-topic";
import { useSession } from "../../lib/session/session-provider";

/**
 * `attendance.submitted` -> `role:<tenant>:admin` + `role:<tenant>:principal`
 * (docs/analysis/realtime-plan-2026-09-25.md section 4.4 row 11): the
 * admin/principal dashboard's teacher-attendance-progress screen, which
 * today (plan section 2 row 6) has no live signal at all. Subscribes only
 * to the role(s) the caller actually holds -- matching them against
 * `me.roles` (not the endpoint's own broader access check, which also
 * allows `super_admin`, a role this event is never published to).
 */
export function useAdminDashboardLive(enabled: boolean): void {
  const { me } = useSession();
  const holdsAdminRole = (me?.roles ?? []).some((role) => role.slug === "admin");
  const holdsPrincipalRole = (me?.roles ?? []).some((role) => role.slug === "principal");
  useLiveTopic(enabled && holdsAdminRole ? "role:admin" : undefined);
  useLiveTopic(enabled && holdsPrincipalRole ? "role:principal" : undefined);
  useLiveInvalidate(["attendance.submitted"], [queryKeys.adminDashboard()]);
}
