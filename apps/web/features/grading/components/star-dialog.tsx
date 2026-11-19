"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  NumberInput,
  SegmentedControl,
  Textarea,
  useToast,
  useSubmitValidation,
} from "@newsekolah/ui";
import { Minus, Plus, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useGiveStarMutation } from "../api";
import { fromText, toText } from "../lib/number-text";

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
  const { ref: formRef, attempted, check } = useSubmitValidation();

  async function submit() {
    if (!check(validAmount)) return;
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
          ref={formRef}
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p className="flex items-center gap-1.5 text-body-sm text-fg-muted">
            <Star className="size-4" aria-hidden="true" />
            {t("currentBalance", { count: currentBalance })}
          </p>
          <SegmentedControl<"give" | "take">
            aria-label={t("action")}
            fullWidth
            value={direction === 1 ? "give" : "take"}
            onValueChange={(value) => {
              setDirection(value === "give" ? 1 : -1);
            }}
            options={[
              { value: "give", label: t("give"), icon: <Plus /> },
              { value: "take", label: t("take"), icon: <Minus /> },
            ]}
          />
          <Field
            label={t("amount")}
            required
            hint={attempted && !validAmount ? undefined : t("amountHint")}
            error={attempted && !validAmount ? t("amountHint") : undefined}
          >
            <NumberInput
              min={1}
              max={999}
              value={fromText(amount)}
              onChange={(value) => {
                setAmount(toText(value));
              }}
              className="w-32"
            />
          </Field>
          <Field label={t("note")}>
            <Textarea
              rows={2}
              value={note}
              placeholder={t("notePlaceholder")}
              maxLength={255}
              onChange={(e) => {
                setNote(e.target.value);
              }}
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" loading={giveStar.isPending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
