"use client";

import { Input } from "@newsekolah/ui";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { memo, useState } from "react";

import type { ViolationType } from "../../discipline/api";
import type { RosterItem, SessionDetail } from "../api";

import { AttendanceStatusRadioGroup } from "./attendance-status-radio-group";
import { ViolationPicker } from "./violation-picker";

type AttendanceStatus = SessionDetail["statuses"][number];

/**
 * One roster row, kept in its own component so a keystroke in one
 * student's note does not re-render the other 35 rows: props are the
 * student's own status/note/violations slice plus stable callbacks, and
 * `memo` is what bails an unaffected row out of a re-render (the React
 * Compiler lint rules run in this repo, but the compiler itself is not
 * part of the build, so the bailout must be explicit).
 */
export const SessionRosterRow = memo(function SessionRosterRow({
  item,
  index,
  statuses,
  currentStatus,
  note,
  violationIds,
  violationTypes,
  violationTypesLoading,
  isPresent,
  disabled,
  onStatusChange,
  onNoteChange,
  onToggleViolation,
}: {
  item: RosterItem;
  index: number;
  statuses: AttendanceStatus[];
  currentStatus: string;
  note: string;
  violationIds: string[];
  violationTypes: ViolationType[];
  violationTypesLoading: boolean;
  isPresent: boolean;
  disabled: boolean;
  onStatusChange: (studentId: string, statusCode: string) => void;
  onNoteChange: (studentId: string, value: string) => void;
  onToggleViolation: (studentId: string, violationTypeId: string) => void;
}): ReactElement {
  const t = useTranslations("app.attendance.session");
  // Local draft so typing paints instantly in this row; the value is
  // still committed to the parent on every change (cheap now that only
  // this row re-renders), which keeps the pending-changes count and the
  // submit payload exactly as they were before this split.
  const [draftNote, setDraftNote] = useState(note);

  return (
    <li className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-6 text-right text-[12px] text-fg-muted">{index + 1}</span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[14px] text-fg">{item.name}</span>
          {item.blocked && (
            <span className="flex items-center gap-1 text-[12px] text-fg-muted">
              <Lock className="size-3" aria-hidden="true" />
              {item.blocked_reason ?? t("blocked")}
            </span>
          )}
          {!item.blocked && item.source && item.source !== "teacher" && (
            <span className="text-[12px] text-fg-muted">{t(`source.${item.source}`)}</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AttendanceStatusRadioGroup
          statuses={statuses}
          value={currentStatus}
          label={item.name}
          disabled={Boolean(item.blocked) || disabled}
          onChange={(statusCode) => {
            onStatusChange(item.student_user_id, statusCode);
          }}
        />
        {!isPresent && !item.blocked && (
          <Input
            value={draftNote}
            onChange={(e) => {
              setDraftNote(e.target.value);
              onNoteChange(item.student_user_id, e.target.value);
            }}
            placeholder={t("notePlaceholder")}
            aria-label={t("noteFor", { name: item.name })}
            className="w-40"
            disabled={disabled}
          />
        )}
        {!item.blocked && (
          <ViolationPicker
            studentName={item.name}
            selected={violationIds}
            types={violationTypes}
            loading={violationTypesLoading}
            disabled={disabled}
            onToggle={(violationTypeId) => {
              onToggleViolation(item.student_user_id, violationTypeId);
            }}
          />
        )}
      </div>
    </li>
  );
});
