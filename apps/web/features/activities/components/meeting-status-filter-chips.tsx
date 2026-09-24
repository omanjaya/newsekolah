"use client";

import { cn } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { AttendanceStatus } from "../api";
import { STATUS_OPTIONS, type MeetingStatusToken, meetingStatusToken } from "../lib/meeting-status";

const CHIP_ACTIVE_CLASS: Record<MeetingStatusToken, string> = {
  present: "border-status-present bg-status-present/15 text-status-present-fg",
  sick: "border-status-sick bg-status-sick/15 text-status-sick-fg",
  excused: "border-status-excused bg-status-excused/15 text-status-excused-fg",
  absent: "border-status-absent bg-status-absent/15 text-status-absent-fg",
};

/**
 * Per-status counts as a row of tappable chips: tapping one filters the
 * roster to that status, a second tap clears it. Mirrors
 * attendance/components/attendance-status-filter-chips.tsx, scaled down to
 * this roster's four codes.
 */
export function MeetingStatusFilterChips({
  counts,
  active,
  onToggle,
}: {
  counts: Record<AttendanceStatus, number>;
  active: Set<AttendanceStatus>;
  onToggle: (code: AttendanceStatus) => void;
}): ReactElement {
  const t = useTranslations("app.activities.clubDetail.meetings.roster");
  return (
    <div
      role="group"
      aria-label={t("filterByStatus")}
      className={cn(
        "flex snap-x snap-mandatory gap-2 overflow-x-auto py-0.5",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "md:flex-wrap md:overflow-visible",
      )}
    >
      {STATUS_OPTIONS.map((code) => {
        const selected = active.has(code);
        const token = meetingStatusToken(code);
        return (
          <button
            key={code}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              onToggle(code);
            }}
            className={cn(
              "flex min-h-8 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
              selected ? CHIP_ACTIVE_CLASS[token] : "border-border text-fg-muted hover:bg-bg",
            )}
          >
            <span>{t(`statuses.${code}`)}</span>
            <span className="tabular-nums">{counts[code]}</span>
          </button>
        );
      })}
    </div>
  );
}
