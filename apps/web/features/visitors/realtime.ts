"use client";

import { useLiveInvalidate } from "../../lib/realtime/use-live-invalidate";
import { useLiveTopic } from "../../lib/realtime/use-live-topic";
import { useSession } from "../../lib/session/session-provider";

/**
 * `visitor.checked_in` / `.checked_out` -> `role:<tenant>:staff` +
 * `role:<tenant>:principal` + `role:<tenant>:admin`
 * (docs/analysis/realtime-plan-2026-09-25.md section 4.4 rows 15-16,
 * corrected from a public `tenant:<tenant>:visitor-board` topic the
 * subscribe protocol never recognized): the front-desk gate board (plan
 * section 2 row 5), which polls every 30 seconds today. The roles match
 * `openapi/modules/visitors.yaml`'s default `view_visitors` holders.
 */
export function useVisitorBoardLive(): void {
  const { me } = useSession();
  const holdsStaffRole = (me?.roles ?? []).some((role) => role.slug === "staff");
  const holdsPrincipalRole = (me?.roles ?? []).some((role) => role.slug === "principal");
  const holdsAdminRole = (me?.roles ?? []).some((role) => role.slug === "admin");
  useLiveTopic(holdsStaffRole ? "role:staff" : undefined);
  useLiveTopic(holdsPrincipalRole ? "role:principal" : undefined);
  useLiveTopic(holdsAdminRole ? "role:admin" : undefined);
  useLiveInvalidate(["visitor.checked_in", "visitor.checked_out"], [["visitors", "board"]]);
}
