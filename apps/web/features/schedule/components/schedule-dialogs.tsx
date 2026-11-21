"use client";

import { Dialog, DialogContent } from "@newsekolah/ui";
import type { ReactElement } from "react";

import type { ScheduleBlock } from "../api";
import { heldBy, maxEffectiveFrom, minEffectiveFrom, needsEffectiveDate } from "../block-policy";
import { cellDate, defaultEffectiveFrom } from "../week";

import { type EffectiveDateConfig, ScheduleForm } from "./schedule-form";

/** The dates the editor's "Berlaku mulai" defaults and bounds come from. */
export interface EditorDates {
  /** The school's today. */
  today: string;
  /** The Monday of the week shown. */
  weekStart: string;
  yearStart?: string;
  yearEnd?: string;
}

/**
 * The "Berlaku mulai" of a new lesson in `day`'s slot of the week shown:
 * that date, never before today, inside the year.
 */
export function createDateConfig(dates: EditorDates, day: number): EffectiveDateConfig {
  return {
    mode: "create",
    defaultValue: defaultEffectiveFrom({
      today: dates.today,
      preferred: cellDate(dates.weekStart, day),
      yearStart: dates.yearStart,
      yearEnd: dates.yearEnd,
    }),
    min: dates.yearStart,
    max: dates.yearEnd,
    today: dates.today,
  };
}

/**
 * The "Berlaku mulai" of a change to `block`: asked for a block with
 * history (from its earliest allowed date, or the week shown when that is
 * later, up to its own last date when it has one, naming what holds that
 * earliest date there), not asked for one without (it is corrected in
 * place).
 */
export function editDateConfig(dates: EditorDates, block: ScheduleBlock): EffectiveDateConfig {
  if (!needsEffectiveDate(block)) {
    return { mode: "none", defaultValue: "" };
  }
  const min = minEffectiveFrom(block);
  const max = maxEffectiveFrom(block, dates.yearEnd);
  return {
    mode: "dated",
    defaultValue: defaultEffectiveFrom({
      today: dates.today,
      preferred: dates.weekStart,
      yearStart: dates.yearStart,
      yearEnd: max,
      min,
    }),
    min,
    max,
    today: dates.today,
    heldBy: heldBy(block),
  };
}

/**
 * The add and edit dialogs, which differ only in what they start from:
 * an empty slot's day and period, or the block being changed. Only a
 * schedule manager (`canManage`) dates a change.
 */
export function ScheduleDialogs({
  year,
  creating,
  editing,
  effectiveClassId,
  effectiveTeacherId,
  canManage,
  dates,
  onCloseCreate,
  onCloseEdit,
  t,
}: {
  year: { id: string };
  creating: { day: number; startSeq: number } | null;
  editing: ScheduleBlock | null;
  effectiveClassId: string;
  effectiveTeacherId: string;
  canManage: boolean;
  dates: EditorDates;
  onCloseCreate: () => void;
  onCloseEdit: () => void;
  t: (key: string) => string;
}): ReactElement {
  return (
    <>
      <Dialog
        open={creating !== null}
        onOpenChange={(open) => {
          if (!open) onCloseCreate();
        }}
      >
        <DialogContent title={t("addBlock")}>
          {creating && (
            <ScheduleForm
              yearId={year.id}
              initialDay={creating.day}
              initialStartSeq={creating.startSeq}
              initialClassId={effectiveClassId}
              initialTeacherId={effectiveTeacherId}
              effective={canManage ? createDateConfig(dates, creating.day) : undefined}
              onDone={onCloseCreate}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) onCloseEdit();
        }}
      >
        <DialogContent title={t("editBlock")}>
          {editing && (
            <ScheduleForm
              yearId={year.id}
              initialDay={editing.day_of_week}
              initialStartSeq={editing.start_seq}
              initialClassId={editing.class_id}
              initialTeacherId={editing.teacher_user_id}
              editing={editing}
              effective={canManage ? editDateConfig(dates, editing) : undefined}
              onDone={onCloseEdit}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
