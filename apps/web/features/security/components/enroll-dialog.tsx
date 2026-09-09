"use client";

import { Dialog, DialogContent } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import type { ReactElement } from "react";

import { useConfirmMfaEnrolmentMutation, type MfaEnrolment } from "../api";

import { MfaCodeForm } from "./mfa-code-form";

/**
 * Second half of the enable flow, opened once `startMfaEnrolment` has
 * returned a secret. `enrolment.recovery_codes` is shown once by the API
 * and never re-requestable, so it stays in the parent's memory and is
 * handed to `onConfirmed` for the recovery-codes dialog rather than
 * fetched again here.
 */
export function EnrollDialog({
  enrolment,
  onClose,
  onConfirmed,
}: {
  enrolment: MfaEnrolment;
  onClose: () => void;
  onConfirmed: (recoveryCodes: string[]) => void;
}): ReactElement {
  const t = useTranslations("app.security.enroll");
  const confirmEnrolment = useConfirmMfaEnrolmentMutation();

  async function handleConfirm(code: string) {
    await confirmEnrolment.mutateAsync(code);
    onConfirmed(enrolment.recovery_codes);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent title={t("dialogTitle")} description={t("scanStepBody")}>
        <div className="flex flex-col gap-4">
          <div className="flex justify-center rounded-sm border border-border bg-bg p-4">
            <QRCodeSVG value={enrolment.otpauth_url} size={180} level="M" marginSize={2} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-fg-muted">{t("manualEntryLabel")}</span>
            <code className="rounded-xs bg-bg px-2 py-1 text-[13px] tracking-wide text-fg">
              {enrolment.secret}
            </code>
          </div>
          <MfaCodeForm
            codeLabel={t("codeLabel")}
            submitLabel={t("confirm")}
            onSubmit={handleConfirm}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
