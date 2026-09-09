"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Dialog, DialogContent, Input, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSetManualReportScoreMutation } from "../api";

export interface ManualScoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  subjectId: string;
  termId?: string;
  studentId: string;
  studentName: string;
  computedAverage?: number;
  currentManualScore?: number;
}

/**
 * Overrides one student's report score for this class-subject. Clearing
 * the field and saving removes the override, so the report score falls
 * back to the computed average again.
 */
export function ManualScoreDialog({
  open,
  onOpenChange,
  classId,
  subjectId,
  termId,
  studentId,
  studentName,
  computedAverage,
  currentManualScore,
}: ManualScoreDialogProps): ReactElement {
  const t = useTranslations("app.grading.manualScoreDialog");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const setManual = useSetManualReportScoreMutation();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!open) return;
    setValue(currentManualScore !== undefined ? String(currentManualScore) : "");
  }, [open, currentManualScore]);

  async function save() {
    const trimmed = value.trim();
    try {
      await setManual.mutateAsync({
        class_id: classId,
        subject_id: subjectId,
        student_user_id: studentId,
        ...(termId ? { term_id: termId } : {}),
        manual_score: trimmed === "" ? null : Number(trimmed),
      });
      toast.success(t("saved"));
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("title", { name: studentName })}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {computedAverage !== undefined && (
            <p className="text-[13px] text-fg-muted">
              {t("computedAverage", { score: computedAverage.toFixed(1) })}
            </p>
          )}
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("score")}</span>
            <Input
              type="number"
              step="0.1"
              value={value}
              placeholder={t("scorePlaceholder")}
              onChange={(e) => {
                setValue(e.target.value);
              }}
            />
          </label>
          <p className="text-[13px] text-fg-muted">{t("hint")}</p>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" loading={setManual.isPending}>
              {t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
