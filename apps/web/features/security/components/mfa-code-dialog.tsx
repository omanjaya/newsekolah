"use client";

import { Dialog, DialogContent } from "@newsekolah/ui";
import type { ReactElement } from "react";

import { MfaCodeForm } from "./mfa-code-form";

export function MfaCodeDialog({
  title,
  description,
  codeLabel,
  confirmLabel,
  destructive,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  codeLabel: string;
  confirmLabel: string;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: (code: string) => Promise<void>;
}): ReactElement {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent title={title} description={description}>
        <MfaCodeForm
          codeLabel={codeLabel}
          submitLabel={confirmLabel}
          destructive={destructive}
          onSubmit={onConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}
