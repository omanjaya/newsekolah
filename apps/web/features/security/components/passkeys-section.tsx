"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  EmptyState,
  IconButton,
  Input,
  Skeleton,
  useToast,
} from "@newsekolah/ui";
import { KeyRound, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { isPasskeySupported } from "../../../lib/webauthn";
import {
  useDeletePasskeyMutation,
  useRegisterPasskeyMutation,
  useRenamePasskeyMutation,
  usePasskeysQuery,
  type Passkey,
} from "../api";

/**
 * Passkey management: add, rename, and remove a WebAuthn credential for
 * the current account. Registration must run from a user gesture (the
 * "add" button click), which is why it is not started automatically or
 * from a dialog that opens on its own.
 */
export function PasskeysSection(): ReactElement | null {
  const t = useTranslations("app.security.passkeys");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const passkeys = usePasskeysQuery();
  const register = useRegisterPasskeyMutation();
  const rename = useRenamePasskeyMutation();
  const remove = useDeletePasskeyMutation();

  const [addName, setAddName] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [renaming, setRenaming] = useState<Passkey | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<Passkey | null>(null);

  if (!isPasskeySupported()) {
    return null;
  }

  function reportError(error: unknown) {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  }

  async function handleAddSubmit() {
    const name = addName.trim();
    if (!name) return;
    try {
      await register.mutateAsync(name);
      setShowAddDialog(false);
      setAddName("");
      toast.success(t("toasts.added"));
    } catch (error) {
      reportError(error);
    }
  }

  async function handleRenameSubmit() {
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name) return;
    try {
      await rename.mutateAsync({ passkeyId: renaming.id, name });
      setRenaming(null);
      toast.success(t("toasts.renamed"));
    } catch (error) {
      reportError(error);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      setDeleting(null);
      toast.success(t("toasts.removed"));
    } catch (error) {
      reportError(error);
    }
  }

  const items = passkeys.data ?? [];

  return (
    <section className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
        <p className="text-[13px] text-fg-muted">{t("description")}</p>
      </div>

      {passkeys.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<KeyRound />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            <Button
              size="sm"
              onClick={() => {
                setShowAddDialog(true);
              }}
            >
              {t("addAction")}
            </Button>
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((passkey) => (
              <li
                key={passkey.id}
                className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <KeyRound className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                  <span className="truncate text-[14px] text-fg">{passkey.name}</span>
                </div>
                <div className="flex shrink-0 gap-1">
                  <IconButton
                    icon={<Pencil />}
                    aria-label={t("renameAction")}
                    onClick={() => {
                      setRenaming(passkey);
                      setRenameValue(passkey.name);
                    }}
                  />
                  <IconButton
                    icon={<Trash2 />}
                    aria-label={t("removeAction")}
                    onClick={() => {
                      setDeleting(passkey);
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowAddDialog(true);
              }}
            >
              {t("addAction")}
            </Button>
          </div>
        </>
      )}

      <Dialog
        open={showAddDialog}
        onOpenChange={(open) => {
          if (!open) setShowAddDialog(false);
        }}
      >
        <DialogContent title={t("addDialogTitle")} description={t("addDialogBody")}>
          <div className="flex flex-col gap-4">
            <Input
              value={addName}
              placeholder={t("namePlaceholder")}
              onChange={(event) => {
                setAddName(event.target.value);
              }}
            />
            <Button
              loading={register.isPending}
              disabled={!addName.trim()}
              onClick={() => void handleAddSubmit()}
            >
              {t("addConfirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
      >
        <DialogContent title={t("renameDialogTitle")}>
          <div className="flex flex-col gap-4">
            <Input
              value={renameValue}
              onChange={(event) => {
                setRenameValue(event.target.value);
              }}
            />
            <Button
              loading={rename.isPending}
              disabled={!renameValue.trim()}
              onClick={() => void handleRenameSubmit()}
            >
              {t("renameConfirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("removeDialogTitle")}
        description={deleting ? t("removeDialogBody", { name: deleting.name }) : undefined}
        confirmLabel={t("removeAction")}
        destructive
        confirming={remove.isPending}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </section>
  );
}
