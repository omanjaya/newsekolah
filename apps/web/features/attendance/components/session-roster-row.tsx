"use client";

import { Avatar, Input } from "@newsekolah/ui";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { memo, useState } from "react";

import { formatDisplayName } from "../../../lib/text/format-name";
import type { ViolationType } from "../../discipline/api";
import { StudentLink } from "../../students/components/student-link";
import type { RosterItem, SessionDetail } from "../api";
import { sourceNoteText } from "../lib/source-note";

import { AttendanceStatusRadioGroup } from "./attendance-status-radio-group";
import { SessionRowActionsMenu } from "./session-row-actions-menu";
import { StudentYearRecap } from "./student-year-recap";

type AttendanceStatus = SessionDetail["statuses"][number];

/**
 * One roster row, kept in its own component so a keystroke in one
 * student's note does not re-render the other 35 rows: props are the
 * student's own status/note/violations slice plus stable callbacks, and
 * `memo` is what bails an unaffected row out of a re-render (the React
 * Compiler lint rules run in this repo, but the compiler itself is not
 * part of the build, so the bailout must be explicit).
 *
 * Two lines by design (docs/07-ui-ux.md's row-height target, ~96px on a
 * 390px phone): identity (avatar, name, NIS, recap) on one line, the five
 * status buttons plus a single "..." actions button on the next -- a note
 * and a violation icon used to each claim their own 44px target and push
 * a third line onto every one of 36+ rows.
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
  const tAttendance = useTranslations("app.attendance");
  // Local draft so typing paints instantly in this row; the value is
  // still committed to the parent on every change (cheap now that only
  // this row re-renders), which keeps the pending-changes count and the
  // submit payload exactly as they were before this split. A row filled
  // in from a permit starts from its localized note ("Surat izin 21/...")
  // instead of the API's English machine text; the parent keeps the
  // stored note, so it is saved unchanged unless the teacher edits it.
  const [draftNote, setDraftNote] = useState(() =>
    sourceNoteText(note, item.source, (number) => tAttendance("leaveLetterNote", { number })),
  );
  // The previous session's recorded status ("PS" in the old SION roster,
  // reference/sion-rebuild-go/frontend/app/attendance/page.tsx's
  // `attendance-ps` column), shown only when it was an exception worth a
  // second look -- a student who was present last time is not news.
  const previousStatusDef = statuses.find((s) => s.code === item.previous_status);
  const previousStatusNote =
    previousStatusDef && !previousStatusDef.counts_as_present ? previousStatusDef.label : null;
  // A not-present status always needs its note visible; a present student
  // keeps the field collapsed behind the actions menu until asked for, so
  // 36 rows of "Hadir" do not each carry an empty text box.
  const [noteExpanded, setNoteExpanded] = useState(!isPresent || draftNote !== "");
  const noteVisible = !isPresent || noteExpanded;

  return (
    <li
      className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0"
      data-changed={changed || undefined}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={item.name} size={32} decorative />
          <div className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-1.5 text-body text-fg">
              <span className="truncate font-medium">
                <StudentLink studentId={item.student_user_id}>
                  {formatDisplayName(item.name)}
                </StudentLink>
              </span>
              {changed && (
                <span
                  role="img"
                  className="size-1.5 shrink-0 rounded-full bg-accent"
                  aria-label={t("rowChanged")}
                  title={t("rowChanged")}
                />
              )}
            </span>
            {/* Secondary facts on one dim line, separated by a middle dot. */}
            <span className="flex flex-wrap items-center gap-x-1.5 text-caption font-normal text-fg-muted">
              {item.nis && <span>{item.nis}</span>}
              {item.nis && item.year_counts && <span aria-hidden="true">·</span>}
              <StudentYearRecap statuses={statuses} yearCounts={item.year_counts} />
            </span>
            {previousStatusNote && (
              <span className="text-caption font-normal text-fg-muted">
                {t("previousStatus", { status: previousStatusNote })}
              </span>
            )}
            {item.blocked && (
              <span className="flex items-center gap-1 text-caption font-normal text-fg-muted">
                <Lock className="size-3" aria-hidden="true" />
                {blockedLabel(item.blocked_reason, t)}
              </span>
            )}
            {!item.blocked && item.source && item.source !== "teacher" && (
              <span className="text-caption font-normal text-fg-muted">
                {t(`source.${item.source}`)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
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
            <SessionRowActionsMenu
              studentName={item.name}
              noteActive={noteVisible}
              noteToggleDisabled={!isPresent}
              onToggleNote={() => {
                setNoteExpanded((prev) => !prev);
              }}
              violationIds={violationIds}
              violationTypes={violationTypes}
              violationTypesLoading={violationTypesLoading}
              disabled={disabled}
              onToggleViolation={(violationTypeId) => {
                onToggleViolation(item.student_user_id, violationTypeId);
              }}
            />
          )}
        </div>
      </div>
      {!item.blocked && noteVisible && (
        <div className="md:pl-11">
          <Input
            value={draftNote}
            onChange={(e) => {
              setDraftNote(e.target.value);
              onNoteChange(item.student_user_id, e.target.value);
            }}
            placeholder={t("notePlaceholder")}
            aria-label={t("noteFor", { name: item.name })}
            className="w-full md:w-64"
            disabled={disabled}
          />
        </div>
      )}
    </li>
  );
});

/** Lock reasons the API sends as codes (PermitsBlocker in the API wiring). */
const BLOCKED_REASONS = ["late_arrival_in_progress"] as const;
type BlockedReason = (typeof BLOCKED_REASONS)[number];

function isBlockedReason(code: string | undefined): code is BlockedReason {
  return BLOCKED_REASONS.includes(code as BlockedReason);
}

/**
 * The row's lock explanation. The API sends a machine code; a known code
 * gets its own sentence, anything else the generic "Locked", so a raw code
 * never reaches the teacher.
 */
function blockedLabel(
  code: string | undefined,
  t: (key: "blocked" | `blockedReason.${BlockedReason}`) => string,
): string {
  return isBlockedReason(code) ? t(`blockedReason.${code}`) : t("blocked");
}
