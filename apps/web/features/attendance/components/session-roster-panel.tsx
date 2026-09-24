"use client";

import { Button, Input } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { ViolationType } from "../../discipline/api";
import type { RosterItem, SessionDetail } from "../api";

import { AttendanceStatusFilterChips } from "./attendance-status-filter-chips";
import { SessionRosterRow } from "./session-roster-row";

type AttendanceStatus = SessionDetail["statuses"][number];

const EMPTY_VIOLATIONS: string[] = [];

/**
 * Search, the sticky per-status filter chips, bulk actions, and the
 * roster list itself -- everything above the fold once a teacher scrolls
 * past the header (docs/07-ui-ux.md's "sticky compact summary bar on
 * scroll").
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
  onSearchChange,
  statusFilter,
  onToggleStatusFilter,
  onStatusChange,
  onNoteChange,
  onToggleViolation,
  onMarkAllPresent,
  onResetChanges,
  canReset,
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
  onSearchChange: (value: string) => void;
  statusFilter: Set<string>;
  onToggleStatusFilter: (code: string) => void;
  onStatusChange: (studentId: string, statusCode: string) => void;
  onNoteChange: (studentId: string, value: string) => void;
  onToggleViolation: (studentId: string, violationTypeId: string) => void;
  onMarkAllPresent: () => void;
  onResetChanges: () => void;
  canReset: boolean;
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
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => {
            onSearchChange(e.target.value);
          }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="w-full sm:w-64"
        />
        <div className="flex flex-col items-end gap-1 sm:ml-auto">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={disabled} onClick={onMarkAllPresent}>
              {t("markAllPresent")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || !canReset}
              onClick={onResetChanges}
            >
              {t("resetChanges")}
            </Button>
          </div>
          <p className="text-[11px] text-fg-muted">{t("markAllPresentHint")}</p>
        </div>
      </div>

      {/* A code like "H" only means "Hadir" once; spelled out here so a
          phone that only has room for the code on each row still tells a
          teacher what the letters mean. */}
      <p className="text-[12px] text-fg-muted sm:hidden">
        {statuses.map((s) => `${s.code} ${s.label}`).join(" · ")}
      </p>

      <div className="sticky top-14 z-(--z-sticky) -mx-4 border-y border-border bg-surface px-4 py-2 md:mx-0 md:rounded-sm md:border">
        <AttendanceStatusFilterChips
          statuses={statuses}
          counts={counts}
          active={statusFilter}
          onToggle={onToggleStatusFilter}
        />
      </div>

      <ul className="divide-y divide-border rounded-sm border border-border bg-surface">
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
        {visible.length === 0 && (
          <li className="px-4 py-6 text-center text-[13px] text-fg-muted">{t("noMatch")}</li>
        )}
      </ul>
    </div>
  );
}
