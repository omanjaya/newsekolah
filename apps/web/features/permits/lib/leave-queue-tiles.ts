import type { StatTileTone } from "@newsekolah/ui";
import { Inbox, type LucideIcon } from "lucide-react";

export interface LeaveQueueTile {
  key: "waiting";
  icon: LucideIcon;
  tone: StatTileTone;
  value: number;
  /** `app.permits.review.*` message key for the tile's label. */
  labelKey: "leaveWaiting";
}

/**
 * The homeroom leave-review queue's stat-tile row: the review-queue
 * endpoint already scopes every item to the caller's own pending stage
 * (leave-review-queue.tsx's own comment), so the single derivable number
 * is how many of those are on screen right now.
 */
export function buildLeaveQueueTiles(count: number): LeaveQueueTile[] {
  return [{ key: "waiting", icon: Inbox, tone: "amber", value: count, labelKey: "leaveWaiting" }];
}
