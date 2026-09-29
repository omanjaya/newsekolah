"use client";

import { cn, type StatusName } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { SessionDetail } from "../api";
import { statusToken } from "../lib/status-tokens";

type AttendanceStatus = SessionDetail["statuses"][number];

// Full class names so Tailwind's scanner generates them (module-level static
// maps, same approach as `attendance-status-radio-group.tsx`).
const TILE_TONE_CLASS: Record<StatusName, string> = {
  present: "border-status-present/30 bg-status-present/10 text-status-present-fg",
  sick: "border-status-sick/30 bg-status-sick/10 text-status-sick-fg",
  excused: "border-status-excused/30 bg-status-excused/10 text-status-excused-fg",
  dispensation:
    "border-status-dispensation/30 bg-status-dispensation/10 text-status-dispensation-fg",
  absent: "border-status-absent/30 bg-status-absent/10 text-status-absent-fg",
  late: "border-status-late/30 bg-status-late/10 text-status-late-fg",
};

const TILE_RING_CLASS: Record<StatusName, string> = {
  present: "ring-status-present",
  sick: "ring-status-sick",
  excused: "ring-status-excused",
  dispensation: "ring-status-dispensation",
  absent: "ring-status-absent",
  late: "ring-status-late",
};

/**
 * Per-status counts as a row of equal bento tiles (docs/07-ui-ux.md
 * "Hijau Segar"), replacing the old horizontally-scrolling chip row: five
 * status tiles fit one screen without a swipe, and the count reads as a
 * number (Manrope), not a small badge next to a label. Tapping a tile
 * filters the roster to that status, a second tap clears it -- same
 * behaviour as the chips this replaces, including "Hadir" itself.
 */
export function AttendanceStatusFilterChips({
  statuses,
  counts,
  active,
  onToggle,
}: {
  statuses: AttendanceStatus[];
  counts: Record<string, number>;
  active: Set<string>;
  onToggle: (code: string) => void;
}): ReactElement {
  const t = useTranslations("app.attendance.session");
  return (
    <div
      role="group"
      aria-label={t("filterByStatus")}
      className="grid gap-1.5 md:gap-2"
      style={{ gridTemplateColumns: `repeat(${statuses.length}, minmax(0, 1fr))` }}
    >
      {statuses.map((status) => {
        const selected = active.has(status.code);
        const token = statusToken(status.code);
        return (
          <button
            key={status.code}
            type="button"
            aria-pressed={selected}
            title={status.label}
            onClick={() => {
              onToggle(status.code);
            }}
            style={
              token
                ? undefined
                : selected
                  ? {
                      backgroundColor: `color-mix(in srgb, ${status.color} 10%, transparent)`,
                      borderColor: status.color,
                      color: status.color,
                    }
                  : { borderColor: status.color, color: status.color }
            }
            className={cn(
              "flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-lg border p-1.5 text-center transition-colors",
              token ? TILE_TONE_CLASS[token] : undefined,
              selected &&
                (token
                  ? cn("ring-2 ring-offset-1", TILE_RING_CLASS[token])
                  : "ring-2 ring-offset-1 ring-accent"),
            )}
          >
            <span className="font-heading text-[18px] leading-none font-bold tabular-nums md:text-[20px]">
              {counts[status.code] ?? 0}
            </span>
            <span className="truncate text-[11px] font-medium">{status.label}</span>
          </button>
        );
      })}
    </div>
  );
}
