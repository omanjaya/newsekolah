import type { StatTileTone } from "@newsekolah/ui";
import { CheckCircle2, Clock, FileText, XCircle, type LucideIcon } from "lucide-react";

import type { WorkflowInstance } from "../api";

export interface LeaveMineTileCounts {
  total: number;
  inProgress: number;
  approved: number;
  rejected: number;
}

/**
 * Buckets a student's own leave requests into the four counts on the
 * "mine" stat-tile row. A request counts as "in progress" through both
 * `in_progress` (waiting on the homeroom teacher) and `approved`
 * (homeroom approved, waiting on the counselor to issue the letter) --
 * neither is a terminal outcome yet (apps/api's `domain.Terminal` agrees:
 * only rejected/completed/cancelled/expired end a workflow). "approved"
 * on this tile specifically means the letter is out, i.e. `completed`.
 * `rejected`, `cancelled`, and `expired` are the terminal ways a request
 * does not end in a letter, so they share the "rejected" bucket.
 */
export function countLeaveMineStatuses(
  statuses: readonly WorkflowInstance["status"][],
): LeaveMineTileCounts {
  let inProgress = 0;
  let approved = 0;
  let rejected = 0;
  for (const status of statuses) {
    if (status === "in_progress" || status === "approved") {
      inProgress += 1;
    } else if (status === "completed") {
      approved += 1;
    } else {
      rejected += 1;
    }
  }
  return { total: statuses.length, inProgress, approved, rejected };
}

export interface LeaveMineTile {
  key: "total" | "inProgress" | "approved" | "rejected";
  icon: LucideIcon;
  tone: StatTileTone;
  value: number;
  /** `app.permits.leave.mine.*` message key for the tile's label. */
  labelKey: "tileTotal" | "tileInProgress" | "tileApproved" | "tileRejected";
}

/** The four stat tiles above a student's leave request cards (docs/07-ui-ux.md bento). */
export function buildLeaveMineTiles(counts: LeaveMineTileCounts): LeaveMineTile[] {
  return [
    { key: "total", icon: FileText, tone: "blue", value: counts.total, labelKey: "tileTotal" },
    {
      key: "inProgress",
      icon: Clock,
      tone: "amber",
      value: counts.inProgress,
      labelKey: "tileInProgress",
    },
    {
      key: "approved",
      icon: CheckCircle2,
      tone: "green",
      value: counts.approved,
      labelKey: "tileApproved",
    },
    {
      key: "rejected",
      icon: XCircle,
      tone: "red",
      value: counts.rejected,
      labelKey: "tileRejected",
    },
  ];
}
