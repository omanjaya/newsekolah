"use client";

import { ApiError } from "@newsekolah/api-client";
import { Alert, Button, Checkbox, Dialog, DialogContent, Input, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { type APIKeyCreated, useCreateAPIKeyMutation } from "../api";

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

  const ownPermissions = me?.permissions ?? [];

  function reset() {
    setName("");
    setSelected(new Set());
    setCreated(null);
    setCopyFailed(false);
  }

  async function handleCreate() {
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

  const canSubmit = name.trim() !== "" && selected.size > 0 && !createKey.isPending;

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
          footer={
            <Button
              size="sm"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              {t("done")}
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <Alert variant="warning" title={t("shownOnceWarning")} />
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-fg-muted">{t("tokenLabel")}</span>
              <code className="break-all rounded-xs bg-bg px-2 py-2 font-mono text-[13px] tracking-wide text-fg">
                {created.token}
              </code>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void copyToken(created.token)}>
              {t("copyToken")}
            </Button>
            {copyFailed && <p className="text-[13px] text-status-absent">{t("copyFailed")}</p>}
          </div>
        </DialogContent>
      ) : (
        <DialogContent
          title={t("dialogTitle")}
          description={t("dialogBody")}
          footer={
            <Button
              size="sm"
              disabled={!canSubmit}
              loading={createKey.isPending}
              onClick={() => void handleCreate()}
            >
              {t("submit")}
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium text-fg">{t("nameLabel")}</span>
              <Input
                value={name}
                maxLength={120}
                onChange={(e) => {
                  setName(e.target.value);
                }}
                placeholder={t("namePlaceholder")}
              />
            </label>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-fg">{t("permissionsLabel")}</span>
              <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-sm border border-border p-3">
                {ownPermissions.length === 0 && (
                  <p className="text-[13px] text-fg-muted">{t("noPermissions")}</p>
                )}
                {ownPermissions.map((code) => (
                  <label key={code} className="flex items-center gap-2 text-[13px] text-fg">
                    <Checkbox
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
                    {code}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
