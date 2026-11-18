"use client";

import { ConfirmDialog } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";

import { useUnsavedChangesPrompt } from "../lib/navigation/use-unsaved-changes-protection";

/**
 * The one question the app asks before a navigation drops changes an editor
 * only holds in memory (lib/navigation/use-unsaved-changes-protection.ts),
 * in place of the browser's own confirm. Focus opens on Cancel, so a stray
 * Enter keeps the changes.
 */
export function UnsavedChangesDialog(): ReactElement {
  const t = useTranslations("app.shell.unsavedChanges");
  const [open, setOpen] = useState(false);
  // Kept after an answer so the text does not blank out while the dialog closes.
  const [message, setMessage] = useState("");
  const answerRef = useRef<((leave: boolean) => void) | null>(null);

  const askToLeave = useCallback(
    (nextMessage: string) =>
      new Promise<boolean>((resolve) => {
        answerRef.current = resolve;
        setMessage(nextMessage);
        setOpen(true);
      }),
    [],
  );
  useUnsavedChangesPrompt(askToLeave);

  // Unmounted mid-question: the held navigation stays where it is.
  useEffect(
    () => () => {
      answerRef.current?.(false);
    },
    [],
  );

  function answer(leave: boolean) {
    answerRef.current?.(leave);
    answerRef.current = null;
    setOpen(false);
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) answer(false);
      }}
      title={t("title")}
      description={message}
      tone="danger"
      onConfirm={() => {
        answer(true);
      }}
    />
  );
}
