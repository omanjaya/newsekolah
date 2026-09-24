"use client";

import { Input, StickySaveBar } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * The sticky bottom action bar: change count, the reason field when a
 * correction is required, and save/retry. Built on `packages/ui`'s
 * `StickySaveBar` (also used by the gradebook's own save bar).
 */
export function SessionSaveBar({
  isCorrection,
  reason,
  onReasonChange,
  isDirty,
  pendingChanges,
  saving,
  formError,
  onSave,
}: {
  isCorrection: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  isDirty: boolean;
  pendingChanges: number;
  saving: boolean;
  formError: string | null;
  onSave: () => void;
}): ReactElement {
  const t = useTranslations("app.attendance.session");
  const tEditor = useTranslations("app.attendanceEditor");

  return (
    <StickySaveBar
      leadingSlot={
        isCorrection ? (
          <Input
            value={reason}
            onChange={(e) => {
              onReasonChange(e.target.value);
            }}
            placeholder={t("reasonPlaceholder")}
            aria-label={t("reasonPlaceholder")}
            className="md:w-96"
          />
        ) : (
          <span className="text-[13px] text-fg-muted">
            {isDirty ? tEditor("unsavedChanges", { count: pendingChanges }) : t("saveHint")}
          </span>
        )
      }
      trailingSlot={
        formError && (
          <span role="alert" className="flex items-center gap-2 text-[13px] text-status-absent">
            {formError}
            <button type="button" className="font-medium underline" onClick={onSave}>
              {t("retry")}
            </button>
          </span>
        )
      }
      saveLabel={isCorrection ? t("saveCorrection") : t("save")}
      saving={saving}
      onSave={onSave}
    />
  );
}
