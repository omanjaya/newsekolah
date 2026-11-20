"use client";

import { ApiError } from "@newsekolah/api-client";
import { ConfirmDialog, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type ScheduleBlock, useDeleteScheduleBlockMutation } from "../api";

import type { EditorDates } from "./schedule-dialogs";
import { ScheduleRetireDialog } from "./schedule-retire-dialog";

/**
 * The two ways a block leaves the timetable. One without history goes
 * entirely, after a plain confirmation (`pendingDelete`). One with
 * recorded attendance or a substitution leaves it from a date on, keeping
 * every earlier lesson (`retiring`, the "Berlaku mulai" dialog).
 */
export function ScheduleDeleteDialogs({
  pendingDelete,
  onCloseDelete,
  retiring,
  onCloseRetire,
  lessonName,
  dates,
}: {
  pendingDelete: ScheduleBlock | null;
  onCloseDelete: () => void;
  retiring: ScheduleBlock | null;
  onCloseRetire: () => void;
  /** Names a block the way the reader knows it, "Matematika, X-A, Senin". */
  lessonName: (block: ScheduleBlock) => string;
  dates: EditorDates;
}): ReactElement {
  const t = useTranslations("app.schedule");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const remove = useDeleteScheduleBlockMutation();

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync({ scheduleIds: pendingDelete.schedule_ids });
      toast.success(t("deleted"));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      onCloseDelete();
    }
  }

  return (
    <>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) onCloseDelete();
        }}
        title={t("deleteConfirmTitle")}
        description={t("deleteConfirmBody")}
        confirmLabel={t("deleteBlock")}
        tone="danger"
        confirming={remove.isPending}
        onConfirm={confirmDelete}
      />
      <ScheduleRetireDialog
        block={retiring}
        name={retiring ? lessonName(retiring) : ""}
        dates={dates}
        onClose={onCloseRetire}
      />
    </>
  );
}
