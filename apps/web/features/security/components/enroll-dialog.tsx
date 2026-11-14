"use client";

import { Card, Dialog, DialogContent } from "@newsekolah/ui";
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
      <DialogContent title={t("dialogTitle")} description={t("scanStepBody")} size="md">
        <MfaCodeForm
          codeLabel={t("codeLabel")}
          submitLabel={t("confirm")}
          onSubmit={handleConfirm}
          onCancel={onClose}
        >
          {/* The QR code stays dark on light in both themes, so any scanner reads it. */}
          <Card tone="sunken" padding="sm" className="items-center">
            <QRCodeSVG
              value={enrolment.otpauth_url}
              size={180}
              level="M"
              marginSize={2}
              className="rounded-md"
            />
          </Card>
          <div className="flex flex-col gap-1.5">
            <p className="text-label text-fg">{t("manualEntryLabel")}</p>
            <code className="break-all rounded-md bg-surface-sunken px-3 py-2 font-mono text-body-sm tracking-wide text-fg select-all">
              {enrolment.secret}
            </code>
          </div>
        </MfaCodeForm>
      </DialogContent>
    </Dialog>
  );
}
