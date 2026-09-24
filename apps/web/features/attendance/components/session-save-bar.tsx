"use client";

import { Button, Input } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * The sticky bottom action bar: change count, the reason field when a
 * correction is required, and save/retry. Sits above the mobile tab bar
 * (`--shell-mobile-tab-offset`) and the desktop sidebar
 * (`--shell-sidebar-width`), matching the shell's own fixed elements.
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
    <div className="fixed inset-x-0 bottom-[var(--shell-mobile-tab-offset)] z-(--z-sticky) border-t border-border bg-surface px-4 py-3 md:bottom-0 md:left-[var(--shell-sidebar-width)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
        {isCorrection ? (
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
        )}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
          {formError && (
            <span role="alert" className="flex items-center gap-2 text-[13px] text-status-absent">
              {formError}
              <button type="button" className="font-medium underline" onClick={onSave}>
                {t("retry")}
              </button>
            </span>
          )}
          <Button onClick={onSave} loading={saving} className="w-full md:w-auto">
            {isCorrection ? t("saveCorrection") : t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
