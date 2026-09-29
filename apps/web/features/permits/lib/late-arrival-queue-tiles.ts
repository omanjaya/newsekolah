import type { StatTileTone } from "@newsekolah/ui";
import { CalendarCheck, ClockAlert, type LucideIcon } from "lucide-react";

import { dayKey } from "../../../lib/group-by-day";

export interface LateArrivalQueueTile {
  key: "waiting" | "today";
  icon: LucideIcon;
  tone: StatTileTone;
  value: number;
  /** `app.permits.review.*` message key for the tile's label. */
  labelKey: "lateWaiting" | "lateToday";
}

/**
 * The late-arrival queue's stat-tile row: the review-queue endpoint only
 * ever returns `in_progress` flows (ListLateArrivalsForReview), so every
 * item on screen is already "menunggu" -- the second tile narrows that
 * same list to the ones opened today, in the tenant's own zone, purely
 * client-side (no extra fetch).
 */
export function buildLateArrivalQueueTiles(
  items: readonly { opened_at: string }[],
  today: string,
  timeZone?: string,
): LateArrivalQueueTile[] {
  return [
    {
      key: "waiting",
      icon: ClockAlert,
      tone: "amber",
      value: items.length,
      labelKey: "lateWaiting",
    },
    {
      key: "today",
      icon: CalendarCheck,
      tone: "blue",
      value: items.filter((item) => dayKey(item.opened_at, timeZone) === today).length,
      labelKey: "lateToday",
    },
  ];
}
