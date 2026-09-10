"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDirectoryQuery } from "../../reference/api";
import { type DiscountKind, useCreateDiscountMutation } from "../api";

export function DiscountForm({
  feeTypeId,
  onDone,
}: {
  feeTypeId: string;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.billing.discounts.form");
  const tDiscounts = useTranslations("app.billing.discounts");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const students = useDirectoryQuery("student");
  const create = useCreateDiscountMutation();

  const [studentId, setStudentId] = useState("");
  const [kind, setKind] = useState<DiscountKind>("percentage");
  const [percentage, setPercentage] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const studentOptions = (students.data?.data ?? []).map((s) => ({ value: s.id, label: s.name }));
  const kindOptions = [
    { value: "percentage", label: t("kind.percentage") },
    { value: "fixed", label: t("kind.fixed") },
    { value: "waiver", label: t("kind.waiver") },
  ];

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!studentId) return;
        create.mutate(
          {
            fee_type_id: feeTypeId,
            student_user_id: studentId,
            kind,
            percentage_bp: kind === "percentage" ? Math.round(Number(percentage) * 100) : undefined,
            amount_minor: kind === "fixed" ? Number(amount) : undefined,
            reason: reason.trim(),
            is_active: true,
          },
          {
            onSuccess: () => {
              toast.success(tDiscounts("saved"));
              onDone();
            },
            onError: (error) => {
              toast.error(
                error instanceof ApiError
                  ? apiErrorMessage(error.code)
                  : apiErrorMessage("UNKNOWN"),
              );
            },
          },
        );
      }}
    >
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("student")}</span>
        <Select
          options={studentOptions}
          value={studentId}
          onValueChange={setStudentId}
          placeholder={t("studentPlaceholder")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("kind.label")}</span>
        <Select
          options={kindOptions}
          value={kind}
          onValueChange={(v) => {
            setKind(v as DiscountKind);
          }}
        />
      </label>
      {kind === "percentage" && (
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("percentage")}</span>
          <Input
            type="number"
            value={percentage}
            onChange={(e) => {
              setPercentage(e.target.value);
            }}
            min={0}
            max={100}
            step={0.01}
            required
          />
        </label>
      )}
      {kind === "fixed" && (
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("amount")}</span>
          <Input
            type="number"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
            }}
            min={0}
            required
          />
        </label>
      )}
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("reason")}</span>
        <Textarea
          rows={2}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
          }}
          placeholder={t("reasonPlaceholder")}
          required
          maxLength={300}
        />
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          loading={create.isPending}
          disabled={!studentId || reason.trim() === ""}
        >
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
