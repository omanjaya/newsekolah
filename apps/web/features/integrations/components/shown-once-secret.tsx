"use client";

import { Alert, Button, DialogContent, useToast } from "@newsekolah/ui";
import { Copy } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";

/**
 * The show-once step of a create dialog: a secret the server returns
 * exactly once (an API key token, a webhook signing secret), with a copy
 * action and a warning that it cannot be shown again. Rendered as the
 * dialog's content in place of the form once the create call succeeds.
 */
export function ShownOnceSecretContent({
  title,
  warning,
  label,
  secret,
  copyLabel,
  copiedMessage,
  copyFailedMessage,
  doneLabel,
  onDone,
}: {
  title: string;
  warning: string;
  label: string;
  secret: string;
  copyLabel: string;
  copiedMessage: string;
  copyFailedMessage: string;
  doneLabel: string;
  onDone: () => void;
}): ReactElement {
  const toast = useToast();
  const [copyFailed, setCopyFailed] = useState(false);

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success(copiedMessage);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <DialogContent
      title={title}
      size="md"
      footer={
        <>
          <Button variant="secondary" icon={<Copy />} onClick={() => void copySecret()}>
            {copyLabel}
          </Button>
          <Button onClick={onDone}>{doneLabel}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Alert tone="warning" title={warning} />
        <div className="flex flex-col gap-1.5">
          <p className="text-label text-fg">{label}</p>
          <code className="break-all rounded-md bg-surface-sunken px-3 py-2 font-mono text-body-sm tracking-wide text-fg select-all">
            {secret}
          </code>
        </div>
        {copyFailed && <Alert tone="danger" title={copyFailedMessage} />}
      </div>
    </DialogContent>
  );
}
