"use client";

import { ApiError } from "@newsekolah/api-client";
import { ConfirmDialog, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type AdminUser, useArchiveUserMutation } from "../api";

/**
 * The users list's archive and restore row action. Archiving cuts the
 * user's sign-in at once, so it asks first, naming who loses access (one
 * misclick on the row menu used to do it with no question asked);
 * restoring is the safe direction and runs straight away. Render `dialog`
 * once in the page.
 */
export function useArchiveUserAction(): {
  run: (user: AdminUser, restore: boolean) => void;
  dialog: ReactElement;
} {
  const t = useTranslations("app.school.users");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const archive = useArchiveUserMutation();
  const [pending, setPending] = useState<AdminUser | null>(null);

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  const run = (user: AdminUser, restore: boolean) => {
    if (!restore) {
      setPending(user);
      return;
    }
    archive.mutate(
      { id: user.id, restore: true },
      {
        onSuccess: () => {
          toast.success(t("actions.restored"));
        },
        onError: fail,
      },
    );
  };

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
      title={pending ? t("actions.archiveTitle", { name: pending.name }) : ""}
      description={pending ? t("actions.archiveBody", { name: pending.name }) : ""}
      confirmLabel={t("actions.archive")}
      tone="danger"
      confirming={archive.isPending}
      onConfirm={async () => {
        if (!pending) return;
        try {
          await archive.mutateAsync({ id: pending.id, restore: false });
          toast.success(t("actions.archived"));
        } catch (error) {
          fail(error);
        }
        setPending(null);
      }}
    />
  );

  return { run, dialog };
}
