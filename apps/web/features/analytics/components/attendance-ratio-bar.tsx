"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

export interface AttendanceRatioBarProps {
  absentDays: number;
  consideredDays: number;
}

/**
 * Present-vs-absent split of the attendance window, as a two-segment
 * proportion bar under the exact counts sentence: a part-to-whole ratio
 * is dataviz's stacked-bar job, not a lone number. `consideredDays` is
 * always > 0 here -- the caller only renders this when
 * `signals.has_attendance` is true, and buildSignals never sets that flag
 * without at least one considered day (analytics/service/compute.go).
 */
export function AttendanceRatioBar({
  absentDays,
  consideredDays,
}: AttendanceRatioBarProps): ReactElement {
  const t = useTranslations("app.analytics.detail.signals");
  const presentDays = Math.max(0, consideredDays - absentDays);
  const label = t("attendanceValue", { absent: absentDays, considered: consideredDays });

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] text-fg">{label}</p>
      <div
        role="img"
        aria-label={label}
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-xs bg-bg"
      >
        {presentDays > 0 && (
          <div
            className="h-full rounded-xs bg-status-present"
            style={{ width: `${(presentDays / consideredDays) * 100}%` }}
            title={t("attendancePresentTooltip", { count: presentDays })}
          />
        )}
        {absentDays > 0 && (
          <div
            className="h-full rounded-xs bg-status-absent"
            style={{ width: `${(absentDays / consideredDays) * 100}%` }}
            title={t("attendanceAbsentTooltip", { count: absentDays })}
          />
        )}
      </div>
    </div>
  );
}
