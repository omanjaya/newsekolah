"use client";

import { ApiError } from "@newsekolah/api-client";
import { type Locale, formatCurrency } from "@newsekolah/i18n";
import { Button, Dialog, DialogContent, Textarea, useToast } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type Payment, useVoidPaymentMutation } from "../api";

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
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const voidMutation = useVoidPaymentMutation();
  const [reason, setReason] = useState("");

  return (
    <Dialog
      open={payment !== null}
      onOpenChange={(open) => {
        if (!open) setReason("");
        onOpenChange(open);
      }}
    >
      <DialogContent
        title={t("title")}
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={voidMutation.isPending}
              disabled={reason.trim() === ""}
              onClick={() => {
                if (!payment) return;
                voidMutation.mutate(
                  { id: payment.id, reason: reason.trim() },
                  {
                    onSuccess: () => {
                      toast.success(t("voided"));
                      setReason("");
                      onOpenChange(false);
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
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-fg-muted">
              {t("body", { amount: formatCurrency(payment.amount_minor, currency, { locale }) })}
            </p>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("reason")}</span>
              <Textarea
                rows={3}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                }}
                maxLength={300}
              />
            </label>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
