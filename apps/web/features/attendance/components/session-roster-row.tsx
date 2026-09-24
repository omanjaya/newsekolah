"use client";

import { Avatar, IconButton, Input } from "@newsekolah/ui";
import { Lock, StickyNote } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { memo, useState } from "react";

import type { ViolationType } from "../../discipline/api";
import type { RosterItem, SessionDetail } from "../api";

import { AttendanceStatusRadioGroup } from "./attendance-status-radio-group";
import { StudentYearRecap } from "./student-year-recap";
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
  changed,
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
  /** Whether this row's status or note differs from what was last saved. */
  changed: boolean;
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
  // The previous session's recorded status ("PS" in the old SION roster,
  // reference/sion-rebuild-go/frontend/app/attendance/page.tsx's
  // `attendance-ps` column), shown only when it was an exception worth a
  // second look -- a student who was present last time is not news.
  const previousStatusDef = statuses.find((s) => s.code === item.previous_status);
  const previousStatusNote =
    previousStatusDef && !previousStatusDef.counts_as_present ? previousStatusDef.label : null;
  // A not-present status always needs its note visible; a present student
  // keeps the field collapsed behind the note button until tapped, so 36
  // rows of "Hadir" do not each carry an empty text box.
  const [noteExpanded, setNoteExpanded] = useState(!isPresent || note !== "");
  const noteVisible = !isPresent || noteExpanded;

  return (
    <li
      className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between"
      data-changed={changed || undefined}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={item.name} size="sm" />
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 truncate text-[14px] text-fg">
            {item.name}
            {changed && (
              <span
                className="size-1.5 shrink-0 rounded-full bg-accent"
                aria-label={t("rowChanged")}
                title={t("rowChanged")}
              />
            )}
          </span>
          {item.nis && <span className="text-[12px] text-fg-muted">{item.nis}</span>}
          <StudentYearRecap statuses={statuses} yearCounts={item.year_counts} />
          {previousStatusNote && (
            <span className="text-[12px] text-fg-muted">
              {t("previousStatus", { status: previousStatusNote })}
            </span>
          )}
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
        {!item.blocked && (
          <IconButton
            icon={<StickyNote />}
            aria-label={
              noteVisible ? t("noteHide", { name: item.name }) : t("noteShow", { name: item.name })
            }
            aria-pressed={noteVisible}
            variant="outline"
            className={draftNote ? "border-accent text-accent" : undefined}
            disabled={disabled || !isPresent}
            onClick={() => {
              setNoteExpanded((prev) => !prev);
            }}
          />
        )}
        {!item.blocked && noteVisible && (
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
