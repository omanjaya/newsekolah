"use client";

import { cn, type StatusName } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { SessionDetail } from "../api";
import { statusToken } from "../lib/status-tokens";

type AttendanceStatus = SessionDetail["statuses"][number];

const CHIP_ACTIVE_CLASS: Record<StatusName, string> = {
  present: "border-status-present bg-status-present/15 text-status-present-fg",
  sick: "border-status-sick bg-status-sick/15 text-status-sick-fg",
  excused: "border-status-excused bg-status-excused/15 text-status-excused-fg",
  dispensation: "border-status-dispensation bg-status-dispensation/15 text-status-dispensation-fg",
  absent: "border-status-absent bg-status-absent/15 text-status-absent-fg",
  late: "border-status-late bg-status-late/15 text-status-late-fg",
};

/**
 * Per-status counts as a sticky chip row: tapping a chip filters the
 * roster to that status, and a second tap clears it. Replaces the old
 * "hanya yang tidak hadir" switch -- any status (including "Hadir") can
 * now be isolated, which a single not-present toggle could not do.
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
    // One horizontally scrollable line on a phone (flex-wrap would make
    // this bar two lines tall, eating into the roster's scroll budget)
    // with snap points so a swipe lands on a whole chip, and the
    // scrollbar hidden since touch scrolling doesn't need a visible one.
    // The caller's own sticky wrapper already bleeds to the screen edge
    // and pads back, so this only needs to fill that width.
    <div
      role="group"
      aria-label={t("filterByStatus")}
      className={cn(
        "flex snap-x snap-mandatory gap-2 overflow-x-auto py-0.5",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "md:flex-wrap md:overflow-visible",
      )}
    >
      {statuses.map((status) => {
        const selected = active.has(status.code);
        const token = statusToken(status.code);
        return (
          <button
            key={status.code}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              onToggle(status.code);
            }}
            style={token ? undefined : { borderColor: status.color, color: status.color }}
            className={cn(
              "flex min-h-8 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
              token
                ? selected
                  ? CHIP_ACTIVE_CLASS[token]
                  : "border-border text-fg-muted hover:bg-bg"
                : undefined,
              selected && !token && "bg-bg",
            )}
          >
            <span>{status.label}</span>
            <span className="tabular-nums">{counts[status.code] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
