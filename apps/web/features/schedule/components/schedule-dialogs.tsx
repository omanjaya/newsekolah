"use client";

import { Dialog, DialogContent } from "@newsekolah/ui";
import type { ReactElement } from "react";

import type { ScheduleBlock } from "../api";

import { ScheduleForm } from "./schedule-form";

/**
 * The add and edit dialogs, which differ only in what they start from:
 * an empty slot's day and period, or the block being changed.
 */
export function ScheduleDialogs({
  year,
  creating,
  editing,
  effectiveClassId,
  effectiveTeacherId,
  onCloseCreate,
  onCloseEdit,
  t,
}: {
  year: { id: string };
  creating: { day: number; startSeq: number } | null;
  editing: ScheduleBlock | null;
  effectiveClassId: string;
  effectiveTeacherId: string;
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
              onDone={onCloseEdit}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
