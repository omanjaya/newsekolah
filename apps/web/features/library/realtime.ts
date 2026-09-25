"use client";

import { useLiveInvalidate } from "../../lib/realtime/use-live-invalidate";
import { useLiveTopic } from "../../lib/realtime/use-live-topic";
import { useSession } from "../../lib/session/session-provider";

/**
 * `library.reserved` / `library.reservation_ready` -> `role:<tenant>:librarian`
 * (docs/analysis/realtime-plan-2026-09-25.md section 4.4 rows 13-14): the
 * circulation desk (plan section 2 row 7), which has no live signal to
 * staff today -- only the member who placed the reservation gets pushed
 * to (through `notification_created`). Query keys are local literals here
 * (not `queryKeys`, matching this feature's own `keys` object in api.ts --
 * see docs/analysis/realtime-plan-2026-09-25.md section 2's note that
 * library/grading/visitors have not moved to the centralized key module).
 */
const LIBRARY_RESERVATION_EVENTS = ["library.reserved", "library.reservation_ready"] as const;

function useLibrarianTopic(enabled: boolean): void {
  const { me } = useSession();
  const holdsLibrarianRole = (me?.roles ?? []).some((role) => role.slug === "librarian");
  useLiveTopic(enabled && holdsLibrarianRole ? "role:librarian" : undefined);
}

/** The circulation desk's landing dashboard (`/library`), which today's activity feeds through. */
export function useLibraryDashboardLive(): void {
  useLibrarianTopic(true);
  useLiveInvalidate(LIBRARY_RESERVATION_EVENTS, [["library", "dashboard"]]);
}

/** A member's reservations, as seen from the staff-facing member profile (`/library/members/[userId]`). */
export function useMemberReservationsLive(userId: string): void {
  const enabled = Boolean(userId);
  useLibrarianTopic(enabled);
  useLiveInvalidate(LIBRARY_RESERVATION_EVENTS, [["library", "members", userId, "reservations"]]);
}
