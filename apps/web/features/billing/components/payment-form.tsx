"use client";

import { ApiError } from "@newsekolah/api-client";
import { type Locale, formatCurrency } from "@newsekolah/i18n";
import { Button, Input, Select, useToast } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type Bill, type PaymentMethod, today, useRecordPaymentMutation } from "../api";

export function PaymentForm({ bill, onDone }: { bill: Bill; onDone: () => void }): ReactElement {
  const t = useTranslations("app.billing.paymentDesk.paymentForm");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const record = useRecordPaymentMutation();

  const outstanding = bill.amount_minor - bill.paid_amount_minor;
  const [amount, setAmount] = useState(String(outstanding));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paidOn, setPaidOn] = useState(today());
  const [reference, setReference] = useState("");

  const methodOptions = [
    { value: "cash", label: t("method.cash") },
    { value: "bank_transfer", label: t("method.bankTransfer") },
    { value: "other", label: t("method.other") },
  ];

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        record.mutate(
          {
            bill_id: bill.id,
            amount_minor: Number(amount),
            method,
            paid_on: paidOn,
            reference: reference.trim() || undefined,
          },
          {
            onSuccess: () => {
              toast.success(t("recorded"));
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
      <p className="text-[13px] text-fg-muted">
        {t("outstanding", { amount: formatCurrency(outstanding, bill.currency, { locale }) })}
      </p>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("amount")}</span>
        <Input
          type="number"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
          }}
          min={1}
          max={outstanding}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("method.label")}</span>
        <Select
          options={methodOptions}
          value={method}
          onValueChange={(v) => {
            setMethod(v as PaymentMethod);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("paidOn")}</span>
        <Input
          type="date"
          value={paidOn}
          onChange={(e) => {
            setPaidOn(e.target.value);
          }}
          max={today()}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("reference")}</span>
        <Input
          value={reference}
          onChange={(e) => {
            setReference(e.target.value);
          }}
          placeholder={t("referencePlaceholder")}
          maxLength={200}
        />
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          loading={record.isPending}
          disabled={Number(amount) <= 0 || Number(amount) > outstanding}
        >
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
