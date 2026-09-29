import type { StatTileTone } from "@newsekolah/ui";
import { CalendarCheck, CheckCircle2, CircleDashed, type LucideIcon } from "lucide-react";

export interface AttendanceDayTile {
  key: "total" | "saved" | "pending";
  icon: LucideIcon;
  tone: StatTileTone;
  value: number;
  /** `app.attendance.*` message key for the tile's label. */
  labelKey: "summaryTotal" | "summarySaved" | "summaryPending";
}

/**
 * The day list's stat-tile row (docs/07-ui-ux.md bento day view): sessions
 * today, how many are saved, how many are still pending. A fourth tile for
 * "% siswa hadir" was considered but left out on purpose -- a session
 * summary only carries `roster_count`/`entered_count` (how many of the
 * roster have *any* entry recorded), not per-entry attendance status, so a
 * true presence percentage can't be derived from it without fetching data
 * this screen does not otherwise need.
 */
export function buildAttendanceDayTiles(
  total: number,
  saved: number,
  pending: number,
): AttendanceDayTile[] {
  return [
    { key: "total", icon: CalendarCheck, tone: "blue", value: total, labelKey: "summaryTotal" },
    { key: "saved", icon: CheckCircle2, tone: "green", value: saved, labelKey: "summarySaved" },
    {
      key: "pending",
      icon: CircleDashed,
      tone: "amber",
      value: pending,
      labelKey: "summaryPending",
    },
  ];
}
