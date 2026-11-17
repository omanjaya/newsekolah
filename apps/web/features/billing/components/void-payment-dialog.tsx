"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Dialog, DialogContent, Field, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type Payment, useVoidPaymentMutation } from "../api";
import { useBillingFormat } from "../lib/use-billing-format";

/**
 * Voids a mistaken payment. It is kept for the audit trail but no longer
 * counts, so the dialog names the amount and asks why before it runs.
 */
export function VoidPaymentDialog({
  payment,
  currency,
  onOpenChange,
}: {
  payment: Payment | null;
  currency: string;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.billing.paymentDesk.voidDialog");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const voidMutation = useVoidPaymentMutation();
  const { money } = useBillingFormat();
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);

  function close() {
    setReason("");
    setAttempted(false);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={payment !== null}
      onOpenChange={(open) => {
        if (!open) close();
        else onOpenChange(open);
      }}
    >
      <DialogContent
        title={t("title")}
        description={
          payment ? t("body", { amount: money(payment.amount_minor, currency) }) : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t("cancel")}
            </Button>
            <Button
              variant="danger"
              loading={voidMutation.isPending}
              onClick={() => {
                setAttempted(true);
                if (!payment || reason.trim() === "") return;
                voidMutation.mutate(
                  { id: payment.id, reason: reason.trim() },
                  {
                    onSuccess: () => {
                      toast.success(t("voided"));
                      close();
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
              {t("confirm")}
            </Button>
          </>
        }
      >
        {payment && (
          <Field
            label={t("reason")}
            required
            error={attempted && reason.trim() === "" ? t("reasonRequired") : undefined}
          >
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
              maxLength={300}
            />
          </Field>
        )}
      </DialogContent>
    </Dialog>
  );
}
