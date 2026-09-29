import type { StatTileTone } from "@newsekolah/ui";
import { Clock, DoorOpen, type LucideIcon } from "lucide-react";

import type { ExitPermitSummary } from "../api";

export interface ExitPermitQueueTile {
  key: "waitingApproval" | "awaitingGate";
  icon: LucideIcon;
  tone: StatTileTone;
  value: number;
  /** `app.permits.review.*` message key for the tile's label. */
  labelKey: "exitWaitingApproval" | "exitAwaitingGate";
}

/**
 * The exit-permit queue's stat-tile row (docs/07-ui-ux.md bento queues):
 * the review-queue endpoint only ever returns two kinds of item --
 * `in_progress` ones awaiting the caller's own approval, and `approved`
 * ones awaiting a gate scan (apps/api's ListExitPermitsForApproval) -- so
 * each caller gets one tile per role they hold, counted straight out of
 * the list already on screen. A permit that has already exited the gate
 * is not in this list at all, so "sedang di luar"/"kembali hari ini" are
 * left out rather than guessed at: they would need a fetch this screen
 * does not otherwise make.
 */
export function buildExitPermitQueueTiles(
  items: readonly Pick<ExitPermitSummary, "status">[],
  canApprove: boolean,
  canGate: boolean,
): ExitPermitQueueTile[] {
  const tiles: ExitPermitQueueTile[] = [];
  if (canApprove) {
    tiles.push({
      key: "waitingApproval",
      icon: Clock,
      tone: "amber",
      value: items.filter((item) => item.status === "in_progress").length,
      labelKey: "exitWaitingApproval",
    });
  }
  if (canGate) {
    tiles.push({
      key: "awaitingGate",
      icon: DoorOpen,
      tone: "blue",
      value: items.filter((item) => item.status === "approved").length,
      labelKey: "exitAwaitingGate",
    });
  }
  return tiles;
}
