"use client";

import { ApiError } from "@newsekolah/api-client";
import { useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { usePaymentReceiptUrlMutation } from "../api";

import { openOrShareReceipt } from "./receipt";

/**
 * Opens a payment's receipt: the PDF in a new tab on a desk computer, the
 * share sheet on a phone. `pendingId` is the payment whose link is being
 * fetched, so only its button spins.
 */
export function useReceipt(): { open: (paymentId: string) => void; pendingId?: string } {
  const t = useTranslations("app.billing.paymentDesk");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const receiptUrl = usePaymentReceiptUrlMutation();
  return {
    open: (paymentId) => {
      receiptUrl.mutate(paymentId, {
        onSuccess: (result) => {
          void openOrShareReceipt(result.url, t("receiptTitle"));
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      });
    },
    pendingId: receiptUrl.isPending ? receiptUrl.variables : undefined,
  };
}
