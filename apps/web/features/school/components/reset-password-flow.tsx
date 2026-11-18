"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Field,
  Input,
  useToast,
} from "@newsekolah/ui";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type AdminUser, useResetPasswordMutation } from "../api";

/**
 * Resetting a password: a question that names the person first, then the
 * one-time link in a read-only field with a copy button, because the
 * admin has to pass it on.
 */
export function ResetPasswordFlow({
  user,
  onClose,
}: {
  /** The account to reset; `null` keeps the flow closed. */
  user: AdminUser | null;
  onClose: () => void;
}): ReactElement {
  const t = useTranslations("app.school.users");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const reset = useResetPasswordMutation();
  const [token, setToken] = useState<string | null>(null);
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/reset-password?token=${token ?? ""}`
      : (token ?? "");

  return (
    <>
      <ConfirmDialog
        open={user !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={t("actions.resetPassword")}
        description={user ? t("resetConfirmBody", { name: user.name }) : ""}
        confirmLabel={t("actions.resetPassword")}
        confirming={reset.isPending}
        onConfirm={async () => {
          if (!user) return;
          try {
            const result = await reset.mutateAsync(user.id);
            setToken(result.set_password_token);
          } catch (error) {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          } finally {
            onClose();
          }
        }}
      />
      <Dialog
        open={token !== null}
        onOpenChange={(open) => {
          if (!open) setToken(null);
        }}
      >
        <DialogContent
          title={t("resetTitle")}
          description={t("resetBody")}
          size="md"
          footer={
            <Button
              icon={<Copy />}
              onClick={() => {
                void navigator.clipboard.writeText(link).then(
                  () => {
                    toast.success(t("resetCopied"));
                  },
                  () => {
                    toast.error(t("resetCopyFailed"));
                  },
                );
              }}
            >
              {t("resetCopy")}
            </Button>
          }
        >
          <Field label={t("resetLinkLabel")}>
            <Input
              readOnly
              value={link}
              onFocus={(event) => {
                event.target.select();
              }}
            />
          </Field>
        </DialogContent>
      </Dialog>
    </>
  );
}
