"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  DialogFooter,
  Field,
  NumberInput,
  SegmentedControl,
  Switch,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  DirectoryPicker,
  useDirectoryPickerLabels,
} from "../../reference/components/directory-picker";
import {
  type Discount,
  type DiscountKind,
  type DiscountWrite,
  useCreateDiscountMutation,
  useUpdateDiscountMutation,
} from "../api";

/**
 * One student's discount on a fee: a percentage, a fixed amount or a full
 * waiver, with the reason the office records for it. The student is fixed
 * once the discount exists; it can be switched off without deleting it.
 */
export function DiscountForm({
  feeTypeId,
  initial,
  onDone,
}: {
  feeTypeId: string;
  initial?: Discount;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.billing.discounts.form");
  const tDiscounts = useTranslations("app.billing.discounts");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const studentLabels = useDirectoryPickerLabels(t("studentPlaceholder"));
  const create = useCreateDiscountMutation();
  const update = useUpdateDiscountMutation();
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const [studentId, setStudentId] = useState(initial?.student_user_id ?? "");
  const [kind, setKind] = useState<DiscountKind>(initial?.kind ?? "percentage");
  const [percentage, setPercentage] = useState<number | null>(
    initial?.percentage_bp !== undefined ? initial.percentage_bp / 100 : null,
  );
  const [amount, setAmount] = useState<number | null>(initial?.amount_minor ?? null);
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [attempted, setAttempted] = useState(false);

  const errors = {
    student: studentId === "" ? t("errors.student") : undefined,
    percentage: kind === "percentage" && percentage === null ? t("errors.percentage") : undefined,
    amount: kind === "fixed" && amount === null ? t("errors.amount") : undefined,
    reason: reason.trim() === "" ? t("errors.reason") : undefined,
  };
  const valid = Object.values(errors).every((error) => error === undefined);
  const shown = (error: string | undefined) => (attempted ? error : undefined);
  const pending = create.isPending || update.isPending;

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setAttempted(true);
        if (!valid || pending) return;
        const body: DiscountWrite = {
          fee_type_id: feeTypeId,
          student_user_id: studentId,
          kind,
          percentage_bp: kind === "percentage" ? Math.round((percentage ?? 0) * 100) : undefined,
          amount_minor: kind === "fixed" ? (amount ?? 0) : undefined,
          reason: reason.trim(),
          is_active: isActive,
        };
        const callbacks = {
          onSuccess: () => {
            toast.success(tDiscounts("saved"));
            onDone();
          },
          onError: (error: unknown) => {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          },
        };
        if (initial) update.mutate({ ...body, id: initial.id }, callbacks);
        else create.mutate(body, callbacks);
      }}
    >
      <Field label={t("student")} required error={shown(errors.student)}>
        <DirectoryPicker
          profileKind="student"
          disabled={initial !== undefined}
          value={studentId}
          onValueChange={setStudentId}
          labels={studentLabels}
        />
      </Field>
      <Field label={t("kind.label")}>
        {(control) => (
          <SegmentedControl<DiscountKind>
            aria-labelledby={control.labelId}
            value={kind}
            onValueChange={setKind}
            fullWidth
            options={[
              { value: "percentage", label: t("kind.percentage") },
              { value: "fixed", label: t("kind.fixed") },
              { value: "waiver", label: t("kind.waiver") },
            ]}
          />
        )}
      </Field>
      {kind === "percentage" && (
        <Field label={t("percentage")} required error={shown(errors.percentage)}>
          <NumberInput
            value={percentage}
            onChange={setPercentage}
            min={0}
            max={100}
            step={0.01}
            suffix="%"
          />
        </Field>
      )}
      {kind === "fixed" && (
        <Field label={t("amount")} required error={shown(errors.amount)}>
          <NumberInput
            value={amount}
            onChange={setAmount}
            min={0}
            prefix="Rp"
            useGrouping
            inputClassName="tabular-nums"
          />
        </Field>
      )}
      <Field label={t("reason")} required error={shown(errors.reason)}>
        <Textarea
          rows={2}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
          }}
          placeholder={t("reasonPlaceholder")}
          maxLength={300}
        />
      </Field>
      <Field label={t("active")} orientation="horizontal">
        {(control) => (
          <Switch
            id={control.id}
            aria-describedby={control["aria-describedby"]}
            checked={isActive}
            onCheckedChange={setIsActive}
          />
        )}
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
