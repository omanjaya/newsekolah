"use client";

import { Alert, Button, Dialog, DialogContent, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * Recovery codes are returned once by the API (enrolment or regeneration)
 * and never stored client-side beyond this dialog's lifetime, per
 * docs/08-security.md ("tidak pernah mengembalikan password plaintext" and
 * the general rule against persisting secrets): closing this dialog is the
 * only chance to copy them.
 */
export function RecoveryCodesDialog({
  codes,
  onClose,
}: {
  codes: string[];
  onClose: () => void;
}): ReactElement {
  const t = useTranslations("app.security.recoveryCodes");
  const toast = useToast();

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={t("dialogTitle")}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => void copyAll()}>
              {t("copyAll")}
            </Button>
            <Button size="sm" onClick={onClose}>
              {t("done")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Alert variant="warning" title={t("dialogBody")} />
          <ul className="grid grid-cols-2 gap-2 rounded-sm border border-border bg-bg p-3 font-mono text-[13px] tracking-wide text-fg">
            {codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
