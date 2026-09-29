"use client";

import { Input, StickySaveBar } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * The sticky bottom action bar: a plain-language summary ("N siswa · M
 * diubah dari hadir") on the left, the reason field when a correction is
 * required, and save/retry. Built on `packages/ui`'s `StickySaveBar` (also
 * used by the gradebook's own save bar).
 */
export function SessionSaveBar({
  isCorrection,
  reason,
  onReasonChange,
  studentTotal,
  changedFromDefaultCount,
  saving,
  formError,
  onSave,
}: {
  isCorrection: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  /** Total students on the roster, for the "N siswa" summary. */
  studentTotal: number;
  /** How many students currently hold a status other than the default ("Hadir"). */
  changedFromDefaultCount: number;
  saving: boolean;
  formError: string | null;
  onSave: () => void;
}): ReactElement {
  const t = useTranslations("app.attendance.session");
  const tEditor = useTranslations("app.attendance.editor");

  return (
    <StickySaveBar
      leadingSlot={
        <div className="flex flex-col gap-1.5 md:flex-1">
          <span className="text-[13px] text-fg-muted">
            {tEditor("saveSummary", { total: studentTotal, changed: changedFromDefaultCount })}
          </span>
          {isCorrection && (
            <Input
              value={reason}
              onChange={(e) => {
                onReasonChange(e.target.value);
              }}
              placeholder={t("reasonPlaceholder")}
              aria-label={t("reasonPlaceholder")}
              className="md:w-96"
            />
          )}
        </div>
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
