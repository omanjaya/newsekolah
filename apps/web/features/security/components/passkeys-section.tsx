"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  Field,
  IconCircle,
  Input,
  List,
  ListRow,
  RowActionsMenu,
  SkeletonList,
  useToast,
} from "@newsekolah/ui";
import { Fingerprint, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { usePasskeySupported } from "../../../lib/webauthn";
import {
  useDeletePasskeyMutation,
  useRegisterPasskeyMutation,
  useRenamePasskeyMutation,
  usePasskeysQuery,
  type Passkey,
} from "../api";

/** A short name dialog (add or rename): one labelled field, actions in the footer. */
function NameDialog({
  open,
  title,
  description,
  initial,
  confirmLabel,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description?: string;
  initial: string;
  confirmLabel: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}): ReactElement {
  const t = useTranslations("app.security.passkeys");
  const [name, setName] = useState(initial);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent title={title} description={description} size="sm">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) onSubmit(name.trim());
          }}
        >
          <Field label={t("nameLabel")}>
            <Input
              value={name}
              placeholder={t("namePlaceholder")}
              maxLength={80}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" loading={pending} disabled={!name.trim()}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Passkey management: add, rename, and remove a WebAuthn credential for
 * the current account. Registration must run from a user gesture (the
 * dialog's submit button), which is why it is not started automatically or
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

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [renaming, setRenaming] = useState<Passkey | null>(null);
  const [deleting, setDeleting] = useState<Passkey | null>(null);
  const passkeySupported = usePasskeySupported();

  if (!passkeySupported) {
    return null;
  }

  function reportError(error: unknown) {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  }

  async function handleAdd(name: string) {
    try {
      await register.mutateAsync(name);
      setShowAddDialog(false);
      toast.success(t("toasts.added"));
    } catch (error) {
      reportError(error);
    }
  }

  async function handleRename(name: string) {
    if (!renaming) return;
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
  const addButton = (variant: "primary" | "secondary") => (
    <Button
      variant={variant}
      icon={<Plus />}
      onClick={() => {
        setShowAddDialog(true);
      }}
    >
      {t("addAction")}
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>

      {passkeys.isError && !passkeys.data ? (
        <div className="px-5 pb-5">
          <QueryError retry={() => passkeys.refetch()} error={passkeys.error} />
        </div>
      ) : passkeys.isLoading ? (
        <SkeletonList rows={2} framed={false} className="px-5 pb-5" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Fingerprint aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={addButton("secondary")}
        />
      ) : (
        <>
          <List>
            {items.map((passkey) => (
              <ListRow
                key={passkey.id}
                leading={
                  <IconCircle tone="neutral" size="sm">
                    <Fingerprint />
                  </IconCircle>
                }
                title={passkey.name}
                action={
                  <RowActionsMenu
                    ariaLabel={t("rowActions", { name: passkey.name })}
                    items={[
                      {
                        label: t("renameAction"),
                        icon: <Pencil />,
                        onClick: () => {
                          setRenaming(passkey);
                        },
                      },
                      {
                        label: t("removeAction"),
                        icon: <Trash2 />,
                        tone: "danger",
                        onClick: () => {
                          setDeleting(passkey);
                        },
                      },
                    ]}
                  />
                }
              />
            ))}
          </List>
          <CardFooter>{addButton("secondary")}</CardFooter>
        </>
      )}

      {showAddDialog && (
        <NameDialog
          open
          title={t("addDialogTitle")}
          description={t("addDialogBody")}
          initial=""
          confirmLabel={t("addConfirm")}
          pending={register.isPending}
          onClose={() => {
            setShowAddDialog(false);
          }}
          onSubmit={(name) => void handleAdd(name)}
        />
      )}

      {renaming && (
        <NameDialog
          open
          title={t("renameDialogTitle")}
          initial={renaming.name}
          confirmLabel={t("renameConfirm")}
          pending={rename.isPending}
          onClose={() => {
            setRenaming(null);
          }}
          onSubmit={(name) => void handleRename(name)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("removeDialogTitle")}
        description={deleting ? t("removeDialogBody", { name: deleting.name }) : undefined}
        confirmLabel={t("removeAction")}
        tone="danger"
        confirming={remove.isPending}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </Card>
  );
}
