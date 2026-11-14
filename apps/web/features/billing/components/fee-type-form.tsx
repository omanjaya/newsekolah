"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Checkbox,
  DialogFooter,
  Field,
  FormSection,
  Input,
  NumberInput,
  SegmentedControl,
  Textarea,
  useToast,
} from "@newsekolah/ui";
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

/** Creates or edits a fee: its name, amount, whether it recurs monthly, and whether it is in use. */
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
  const [amount, setAmount] = useState<number | null>(initial ? initial.amount_minor : null);
  const [recurrence, setRecurrence] = useState<Recurrence>(initial?.recurrence ?? "monthly");
  const [period, setPeriod] = useState(initial?.period ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [attempted, setAttempted] = useState(false);

  const errors = {
    name: name.trim() === "" ? t("errors.name") : undefined,
    amount: amount === null ? t("errors.amount") : undefined,
    period: recurrence === "one_off" && period.trim() === "" ? t("errors.period") : undefined,
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
        if (!valid || amount === null || pending) return;
        const body = {
          name: name.trim(),
          description: description.trim() || undefined,
          amount_minor: amount,
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
      <FormSection columns={1}>
        <Field label={t("name")} required error={shown(errors.name)}>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            maxLength={150}
            autoComplete="off"
          />
        </Field>
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
        <Field label={t("recurrence.label")}>
          {(control) => (
            <SegmentedControl<Recurrence>
              aria-labelledby={control.labelId}
              value={recurrence}
              onValueChange={setRecurrence}
              fullWidth
              options={[
                { value: "monthly", label: t("recurrence.monthly") },
                { value: "one_off", label: t("recurrence.oneOff") },
              ]}
            />
          )}
        </Field>
        {recurrence === "one_off" && (
          <Field label={t("period")} required hint={t("periodHint")} error={shown(errors.period)}>
            <Input
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
              }}
              placeholder={t("periodPlaceholder")}
              maxLength={20}
              autoComplete="off"
            />
          </Field>
        )}
        <Field label={t("description")} optional>
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
            }}
            maxLength={2000}
          />
        </Field>
        <Checkbox
          checked={isActive}
          label={t("active")}
          description={t("activeHint")}
          onCheckedChange={(v) => {
            setIsActive(v === true);
          }}
        />
      </FormSection>
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
