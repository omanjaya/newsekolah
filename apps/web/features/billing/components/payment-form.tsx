"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  DataList,
  DataListItem,
  DatePicker,
  DialogFooter,
  Field,
  Input,
  NumberInput,
  SegmentedControl,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import {
  type Bill,
  type Payment,
  type PaymentMethod,
  today,
  useRecordPaymentMutation,
} from "../api";
import { useBillingFormat } from "../lib/use-billing-format";

const METHODS: { value: PaymentMethod; key: string }[] = [
  { value: "cash", key: "cash" },
  { value: "bank_transfer", key: "bankTransfer" },
  { value: "other", key: "other" },
];

/**
 * Records a payment against one bill. The amount starts at the full
 * remainder (paying in full needs no typing), shows thousands separators,
 * says what will be left after it, and refuses more than is owed with a
 * message on the field. `onRecorded` receives the saved payment so the
 * caller can offer its receipt.
 */
export function PaymentForm({
  bill,
  onCancel,
  onRecorded,
}: {
  bill: Bill;
  onCancel: () => void;
  onRecorded: (payment: Payment) => void;
}): ReactElement {
  const t = useTranslations("app.billing.paymentDesk.paymentForm");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const record = useRecordPaymentMutation();
  const { money, day } = useBillingFormat();
  const { me } = useSession();
  const todayIso = today(me?.tenant.timezone);

  const outstanding = bill.amount_minor - bill.paid_amount_minor;
  const [amount, setAmount] = useState<number | null>(outstanding);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paidOn, setPaidOn] = useState(todayIso);
  const [reference, setReference] = useState("");
  const [attempted, setAttempted] = useState(false);

  const amountError =
    amount === null || amount <= 0
      ? t("errors.amount")
      : amount > outstanding
        ? t("errors.tooMuch", { amount: money(outstanding, bill.currency) })
        : undefined;
  const dateError = paidOn === "" ? t("errors.paidOn") : undefined;
  const remainder = amount !== null && amount > 0 ? outstanding - amount : outstanding;

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setAttempted(true);
        if (amountError !== undefined || dateError !== undefined || amount === null) return;
        if (record.isPending) return;
        record.mutate(
          {
            bill_id: bill.id,
            amount_minor: amount,
            method,
            paid_on: paidOn,
            reference: reference.trim() || undefined,
          },
          {
            onSuccess: onRecorded,
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
      <DataList>
        <DataListItem label={t("bill")}>
          {bill.fee_type_name} · {bill.period}
        </DataListItem>
        <DataListItem label={t("dueDate")}>{day(bill.due_date)}</DataListItem>
        <DataListItem label={t("outstandingLabel")}>
          <span className="text-heading tabular-nums">{money(outstanding, bill.currency)}</span>
        </DataListItem>
      </DataList>
      <Field
        label={t("amount")}
        required
        error={attempted || (amount !== null && amount > outstanding) ? amountError : undefined}
        hint={
          amountError === undefined
            ? remainder === 0
              ? t("settlesBill")
              : t("remainderAfter", { amount: money(remainder, bill.currency) })
            : undefined
        }
        labelAside={
          amount !== outstanding ? (
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setAmount(outstanding);
              }}
            >
              {t("payInFull")}
            </Button>
          ) : undefined
        }
      >
        <NumberInput
          value={amount}
          onChange={setAmount}
          min={0}
          prefix="Rp"
          useGrouping
          inputClassName="tabular-nums"
        />
      </Field>
      <Field label={t("method.label")}>
        {(control) => (
          <SegmentedControl<PaymentMethod>
            aria-labelledby={control.labelId}
            value={method}
            onValueChange={setMethod}
            fullWidth
            options={METHODS.map((item) => ({
              value: item.value,
              label: t(`method.${item.key}`),
            }))}
          />
        )}
      </Field>
      <Field label={t("paidOn")} required error={attempted ? dateError : undefined}>
        <DatePicker value={paidOn} onChange={setPaidOn} max={todayIso} today={todayIso} required />
      </Field>
      <Field label={t("reference")} optional hint={t("referenceHint")}>
        <Input
          value={reference}
          onChange={(e) => {
            setReference(e.target.value);
          }}
          maxLength={200}
          autoComplete="off"
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={record.isPending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
