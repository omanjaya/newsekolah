"use client";

import { Avatar, cn } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { memo } from "react";

import { formatDisplayName } from "../../../lib/text/format-name";
import type { AttendanceStatus } from "../api";
import { STATUS_OPTIONS, type MeetingStatusToken, meetingStatusToken } from "../lib/meeting-status";

const SELECTED_CLASS: Record<MeetingStatusToken, string> = {
  present: "border-status-present bg-status-present text-bg",
  sick: "border-status-sick bg-status-sick text-bg",
  excused: "border-status-excused bg-status-excused text-bg",
  absent: "border-status-absent bg-status-absent text-bg",
};

const UNSELECTED_CLASS: Record<MeetingStatusToken, string> = {
  present: "border-status-present/40 text-status-present-fg hover:bg-status-present/10",
  sick: "border-status-sick/40 text-status-sick-fg hover:bg-status-sick/10",
  excused: "border-status-excused/40 text-status-excused-fg hover:bg-status-excused/10",
  absent: "border-status-absent/40 text-status-absent-fg hover:bg-status-absent/10",
};

/**
 * One roster row: avatar and name on the left, the four-code status
 * control on the right -- kept in its own `memo`-wrapped component so
 * tapping one student's status does not re-render the rest of the
 * roster. Mirrors attendance/components/session-roster-row.tsx's row
 * split, but lighter (no note, no violations, no previous-status recap --
 * this roster does not carry any of those).
 */
export const MeetingRosterRow = memo(function MeetingRosterRow({
  studentId,
  name,
  status,
  changed,
  disabled,
  onStatusChange,
}: {
  studentId: string;
  name: string;
  status: AttendanceStatus;
  /** Whether this row's status differs from what was last saved. */
  changed: boolean;
  disabled: boolean;
  onStatusChange: (studentId: string, status: AttendanceStatus) => void;
}): ReactElement {
  const t = useTranslations("app.activities.clubDetail.meetings.roster");

  return (
    <li
      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
      data-changed={changed || undefined}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={name} size="sm" />
        <span className="flex min-w-0 items-center gap-1.5 text-[14px] text-fg">
          <span className="truncate">{formatDisplayName(name)}</span>
          {changed && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-accent"
              aria-label={t("rowChanged")}
              title={t("rowChanged")}
            />
          )}
        </span>
      </div>
      <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-1">
        {STATUS_OPTIONS.map((code) => {
          const selected = status === code;
          const token = meetingStatusToken(code);
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t(`statuses.${code}`)}
              title={t(`statuses.${code}`)}
              disabled={disabled}
              onClick={() => {
                onStatusChange(studentId, code);
              }}
              className={cn(
                "min-h-11 min-w-11 rounded-xs border px-2.5 py-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                selected ? SELECTED_CLASS[token] : UNSELECTED_CLASS[token],
              )}
            >
              {code}
            </button>
          );
        })}
      </div>
    </li>
  );
});
