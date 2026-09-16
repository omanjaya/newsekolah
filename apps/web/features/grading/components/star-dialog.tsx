"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Dialog, DialogContent, Input, Textarea, cn, useToast } from "@newsekolah/ui";
import { Minus, Plus, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useGiveStarMutation } from "../api";

export interface StarDialogProps {
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  classId: string;
  subjectId?: string;
  currentBalance: number;
}

/**
 * Records one +1 or -1 star event for a student, with an optional note.
 * The balance shown here is the class roster's cached balance, refreshed
 * by useGiveStarMutation's invalidation once the entry is saved. The
 * caller mounts this only while a student is targeted, so each open
 * starts from a fresh instance with the form reset.
 */
export function StarDialog({
  onOpenChange,
  studentId,
  studentName,
  classId,
  subjectId,
  currentBalance,
}: StarDialogProps): ReactElement {
  const t = useTranslations("app.grading.starDialog");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const giveStar = useGiveStarMutation();
  const [direction, setDirection] = useState<1 | -1>(1);
  const [amount, setAmount] = useState("1");
  const [note, setNote] = useState("");

  const parsedAmount = Number(amount);
  const validAmount = Number.isInteger(parsedAmount) && parsedAmount >= 1 && parsedAmount <= 999;

  async function submit() {
    if (!validAmount) return;
    try {
      await giveStar.mutateAsync({
        student_user_id: studentId,
        class_id: classId,
        ...(subjectId ? { subject_id: subjectId } : {}),
        delta: direction * parsedAmount,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success(
        direction > 0
          ? t("added", { count: parsedAmount })
          : t("subtracted", { count: parsedAmount }),
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent title={t("title", { name: studentName })}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p className="flex items-center gap-1.5 text-[13px] text-fg-muted">
            <Star className="size-4" aria-hidden="true" />
            {t("currentBalance", { count: currentBalance })}
          </p>
          <div className="flex gap-2" role="radiogroup" aria-label={t("action")}>
            <button
              type="button"
              role="radio"
              aria-checked={direction === 1}
              onClick={() => {
                setDirection(1);
              }}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xs border border-border px-3 py-2 text-[13px] font-medium md:min-h-0",
                direction === 1 ? "border-accent bg-accent/10 text-accent" : "text-fg hover:bg-bg",
              )}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t("give")}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={direction === -1}
              onClick={() => {
                setDirection(-1);
              }}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xs border border-border px-3 py-2 text-[13px] font-medium md:min-h-0",
                direction === -1
                  ? "border-status-absent bg-status-absent/10 text-status-absent"
                  : "text-fg hover:bg-bg",
              )}
            >
              <Minus className="size-4" aria-hidden="true" />
              {t("take")}
            </button>
          </div>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("amount")}</span>
            <Input
              type="number"
              min={1}
              max={999}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
              }}
              className="w-24"
            />
            <span className="text-[12px] text-fg-muted">{t("amountHint")}</span>
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("note")}</span>
            <Textarea
              rows={2}
              value={note}
              placeholder={t("notePlaceholder")}
              maxLength={255}
              onChange={(e) => {
                setNote(e.target.value);
              }}
            />
          </label>
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
            <Button type="submit" loading={giveStar.isPending} disabled={!validAmount}>
              {t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
