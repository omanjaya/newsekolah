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
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("filterByStatus")}>
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
              "flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
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
