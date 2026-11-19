"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogContent,
  Field,
  Input,
  useToast,
  useSubmitValidation,
} from "@newsekolah/ui";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { type APIKeyCreated, useCreateAPIKeyMutation } from "../api";
import { usePermissionLabel } from "../lib/use-permission-label";

/**
 * The checkbox list only offers permissions the signed-in admin holds
 * themself: the server enforces the ceiling regardless (a key's
 * permissions can never exceed its creator's own), but there is no reason
 * to let someone select a permission the request will just reject.
 */
export function CreateAPIKeyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.integrations.apiKeys.create");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { me } = useSession();
  const createKey = useCreateAPIKeyMutation();

  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [created, setCreated] = useState<APIKeyCreated | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  const permissionLabel = usePermissionLabel();
  const {
    ref: bodyRef,
    attempted,
    check,
    reset: resetValidation,
  } = useSubmitValidation<HTMLDivElement>();
  const tValidation = useTranslations("validation");
  const ownPermissions = [...(me?.permissions ?? [])].sort((a, b) =>
    permissionLabel(a).localeCompare(permissionLabel(b)),
  );

  function reset() {
    setName("");
    setSelected(new Set());
    setCreated(null);
    setCopyFailed(false);
    resetValidation();
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  async function handleCreate() {
    if (!check(name.trim() !== "" && selected.size > 0)) return;
    try {
      const response = await createKey.mutateAsync({
        name,
        permissions: Array.from(selected),
      });
      setCreated(response);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  async function copyToken(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      toast.success(t("tokenCopied"));
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      {created ? (
        <DialogContent
          title={t("createdTitle")}
          size="md"
          footer={
            <>
              <Button
                variant="secondary"
                icon={<Copy />}
                onClick={() => void copyToken(created.token)}
              >
                {t("copyToken")}
              </Button>
              <Button onClick={close}>{t("done")}</Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Alert tone="warning" title={t("shownOnceWarning")} />
            <div className="flex flex-col gap-1.5">
              <p className="text-label text-fg">{t("tokenLabel")}</p>
              <code className="break-all rounded-md bg-surface-sunken px-3 py-2 font-mono text-body-sm tracking-wide text-fg select-all">
                {created.token}
              </code>
            </div>
            {copyFailed && <Alert tone="danger" title={t("copyFailed")} />}
          </div>
        </DialogContent>
      ) : (
        <DialogContent
          title={t("dialogTitle")}
          description={t("dialogBody")}
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={close}>
                {t("cancel")}
              </Button>
              <Button loading={createKey.isPending} onClick={() => void handleCreate()}>
                {t("submit")}
              </Button>
            </>
          }
        >
          <div ref={bodyRef} className="flex flex-col gap-5">
            <Field
              label={t("nameLabel")}
              required
              error={attempted && !name.trim() ? tValidation("required") : undefined}
            >
              <Input
                value={name}
                maxLength={120}
                onChange={(e) => {
                  setName(e.target.value);
                }}
                placeholder={t("namePlaceholder")}
              />
            </Field>
            <Field
              label={t("permissionsLabel")}
              required
              hint={t("permissionsHint", { count: selected.size })}
              error={attempted && selected.size === 0 ? t("permissionsRequired") : undefined}
            >
              {(control) => (
                <Card
                  tone="sunken"
                  role="group"
                  aria-labelledby={control.labelId}
                  aria-describedby={control["aria-describedby"]}
                  className="max-h-64 overflow-y-auto px-4 py-1"
                >
                  {ownPermissions.length === 0 ? (
                    <p className="py-3 text-body-sm text-fg-muted">{t("noPermissions")}</p>
                  ) : (
                    ownPermissions.map((code) => (
                      <Checkbox
                        key={code}
                        label={permissionLabel(code)}
                        checked={selected.has(code)}
                        onCheckedChange={(checked) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (checked === true) next.add(code);
                            else next.delete(code);
                            return next;
                          });
                        }}
                      />
                    ))
                  )}
                </Card>
              )}
            </Field>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
