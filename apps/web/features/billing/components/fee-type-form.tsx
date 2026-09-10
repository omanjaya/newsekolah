"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Checkbox, Input, Select, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type FeeType,
  type Recurrence,
  useCreateFeeTypeMutation,
  useUpdateFeeTypeMutation,
} from "../api";

export function FeeTypeForm({
  initial,
  onDone,
}: {
  initial?: FeeType;
  onDone: () => void;
}): ReactElement {
  const tCatalog = useTranslations("app.billing.feeTypes");
  const t = useTranslations("app.billing.feeTypes.form");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateFeeTypeMutation();
  const update = useUpdateFeeTypeMutation();

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount_minor) : "");
  const [recurrence, setRecurrence] = useState<Recurrence>(initial?.recurrence ?? "monthly");
  const [period, setPeriod] = useState(initial?.period ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const pending = create.isPending || update.isPending;
  const recurrenceOptions = [
    { value: "monthly", label: t("recurrence.monthly") },
    { value: "one_off", label: t("recurrence.oneOff") },
  ];

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const body = {
          name: name.trim(),
          description: description.trim() || undefined,
          amount_minor: Number(amount),
          currency: "IDR",
          recurrence,
          period: recurrence === "one_off" ? period.trim() : undefined,
          is_active: isActive,
        };
        const onSuccess = () => {
          toast.success(tCatalog("saved"));
          onDone();
        };
        const onError = (error: unknown) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        };
        if (initial) {
          update.mutate({ id: initial.id, ...body }, { onSuccess, onError });
        } else {
          create.mutate(body, { onSuccess, onError });
        }
      }}
    >
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("name")}</span>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          required
          maxLength={150}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("description")}</span>
        <Textarea
          rows={2}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          maxLength={2000}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("amount")}</span>
        <Input
          type="number"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
          }}
          required
          min={0}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("recurrence.label")}</span>
        <Select
          options={recurrenceOptions}
          value={recurrence}
          onValueChange={(v) => {
            setRecurrence(v as Recurrence);
          }}
        />
      </label>
      {recurrence === "one_off" && (
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("period")}</span>
          <Input
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
            }}
            placeholder={t("periodPlaceholder")}
            required
            maxLength={20}
          />
        </label>
      )}
      <label className="flex items-center gap-2 text-[13px]">
        <Checkbox
          checked={isActive}
          onCheckedChange={(v) => {
            setIsActive(v === true);
          }}
        />
        {t("active")}
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
