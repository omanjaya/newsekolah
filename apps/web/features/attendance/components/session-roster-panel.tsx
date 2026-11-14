"use client";

import { EmptyState, List } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { ViolationType } from "../../discipline/api";
import type { RosterItem, SessionDetail } from "../api";

import { AttendanceStatusFilterChips } from "./attendance-status-filter-chips";
import { SessionRosterRow } from "./session-roster-row";

type AttendanceStatus = SessionDetail["statuses"][number];

const EMPTY_VIOLATIONS: string[] = [];

/**
 * The sticky per-status count row and the roster list itself (docs/07-ui-ux.md's
 * "sticky compact summary bar on scroll"). The page-level bulk actions
 * ("Tandai semua hadir"/"Kosongkan perubahan") live in the page header and
 * the search beside the roster's tab; this panel applies both to the list.
 */
export function SessionRosterPanel({
  roster,
  statuses,
  counts,
  currentStatuses,
  notes,
  violations,
  violationTypes,
  violationTypesLoading,
  changedStudentIds,
  presentCodes,
  defaultCode,
  disabled,
  search,
  statusFilter,
  onToggleStatusFilter,
  onStatusChange,
  onNoteChange,
  onToggleViolation,
}: {
  roster: RosterItem[];
  statuses: AttendanceStatus[];
  counts: Record<string, number>;
  currentStatuses: Record<string, string>;
  notes: Record<string, string>;
  violations: Record<string, string[]>;
  violationTypes: ViolationType[];
  violationTypesLoading: boolean;
  changedStudentIds: Set<string>;
  presentCodes: Set<string>;
  defaultCode: string;
  disabled: boolean;
  search: string;
  statusFilter: Set<string>;
  onToggleStatusFilter: (code: string) => void;
  onStatusChange: (studentId: string, statusCode: string) => void;
  onNoteChange: (studentId: string, value: string) => void;
  onToggleViolation: (studentId: string, violationTypeId: string) => void;
}): ReactElement {
  const t = useTranslations("app.attendance.session");

  const visible = roster.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter.size > 0) {
      const current = currentStatuses[item.student_user_id] ?? defaultCode;
      if (!statusFilter.has(current)) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Sticks under the app header while the roster scrolls. */}
      <div className="sticky top-14 z-sticky -mx-4 border-b border-line bg-bg px-4 py-2 md:-mx-1 md:border-b-0 md:px-1">
        <AttendanceStatusFilterChips
          statuses={statuses}
          counts={counts}
          active={statusFilter}
          onToggle={onToggleStatusFilter}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState variant="compact" title={t("noMatch")} />
      ) : (
        <List framed aria-label={t("rosterLabel")}>
          {visible.map((item) => {
            const current = currentStatuses[item.student_user_id] ?? defaultCode;
            return (
              <SessionRosterRow
                key={item.student_user_id}
                item={item}
                changed={changedStudentIds.has(item.student_user_id)}
                statuses={statuses}
                currentStatus={current}
                note={notes[item.student_user_id] ?? ""}
                violationIds={violations[item.student_user_id] ?? EMPTY_VIOLATIONS}
                violationTypes={violationTypes}
                violationTypesLoading={violationTypesLoading}
                isPresent={presentCodes.has(current)}
                disabled={disabled}
                onStatusChange={onStatusChange}
                onNoteChange={onNoteChange}
                onToggleViolation={onToggleViolation}
              />
            );
          })}
        </List>
      )}
    </div>
  );
}
