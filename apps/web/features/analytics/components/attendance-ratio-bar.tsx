"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

export interface AttendanceRatioBarProps {
  absentDays: number;
  consideredDays: number;
}

/**
 * Present-vs-absent split of the attendance window, as a two-segment
 * proportion bar under the signal's figure (student-risk-panel.tsx), with
 * the exact counts as its accessible name: a part-to-whole ratio is
 * dataviz's stacked-bar job, not a lone number. `consideredDays` is
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
    <div
      role="img"
      aria-label={label}
      className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-sunken"
    >
      {presentDays > 0 && (
        <div
          className="h-full rounded-full bg-status-present"
          style={{ width: `${(presentDays / consideredDays) * 100}%` }}
          title={t("attendancePresentTooltip", { count: presentDays })}
        />
      )}
      {absentDays > 0 && (
        <div
          className="h-full rounded-full bg-status-absent"
          style={{ width: `${(absentDays / consideredDays) * 100}%` }}
          title={t("attendanceAbsentTooltip", { count: absentDays })}
        />
      )}
    </div>
  );
}
