"use client";

import { ApiError } from "@newsekolah/api-client";
import { type BarcodeScanEvent, Dialog, DialogContent, Scanner, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { decodeScanPayload } from "../api";

/**
 * Scanning an approving teacher's QR for one workflow stage, as a bottom
 * sheet on a phone (docs/07-ui-ux.md section 3, Scanner): the camera
 * first, the typed code as the fallback, and a failed scan said in place
 * so the student can try again without losing the sheet. The success toast
 * can depend on the scan's result: the last stage of a flow says the flow
 * is done rather than naming one more stage.
 */
export function StageScanDialog<T>({
  open,
  onOpenChange,
  title,
  description,
  manualLabel,
  successMessage,
  pending,
  onToken,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** The typed fallback's label: "Pindai QR Guru piket: masukkan kode". */
  manualLabel: string;
  /** The toast after an accepted scan, as is or from the scan's result. */
  successMessage: string | ((result: NoInfer<T>) => string);
  pending: boolean;
  /** Sends the scanned stage token; rejects with the API error. */
  onToken: (token: string) => Promise<T>;
}): ReactElement {
  const t = useTranslations("app.permits.scan");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const [failure, setFailure] = useState<{ message: string; key: number } | null>(null);

  async function handleScan(event: BarcodeScanEvent): Promise<boolean> {
    try {
      const result = await onToken(decodeScanPayload(event.code).token);
      toast.success(typeof successMessage === "string" ? successMessage : successMessage(result));
      setFailure(null);
      onOpenChange(false);
      return true;
    } catch (error) {
      setFailure({
        message:
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
        key: Date.now(),
      });
      return false;
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title}>
        {open && (
          <Scanner
            // The sheet is the frame; the scanner's own card would sit in it twice.
            className="border-0 bg-transparent p-0 shadow-none md:p-0"
            description={description}
            onScan={handleScan}
            disabled={pending}
            continuous={false}
            manualLabel={manualLabel}
            manualPlaceholder={t("placeholder")}
            submitLabel={t("submit")}
            result={
              failure
                ? {
                    tone: "danger",
                    title: t("failedTitle"),
                    description: failure.message,
                    key: failure.key,
                  }
                : null
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
