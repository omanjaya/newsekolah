"use client";

import { Alert, Button, Card, Dialog, DialogContent, useToast } from "@newsekolah/ui";
import { Copy } from "lucide-react";
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
        size="md"
        footer={
          <>
            <Button variant="secondary" icon={<Copy />} onClick={() => void copyAll()}>
              {t("copyAll")}
            </Button>
            <Button onClick={onClose}>{t("done")}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Alert tone="warning" title={t("dialogBody")} />
          <Card tone="sunken" padding="sm">
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-body tracking-wide text-fg select-all">
              {codes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
