"use client";

import {
  Alert,
  Button,
  DataList,
  DataListItem,
  Dialog,
  DialogContent,
  IconButton,
  useToast,
} from "@newsekolah/ui";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { PlatformTenantCreated } from "../api";

/**
 * The first administrator's credentials for a school just created. The
 * password is returned exactly once, so the dialog says so, offers a copy
 * button per value and both at once, and closes on "Sudah disimpan".
 */
export function TenantCredentialsDialog({
  created,
  onClose,
}: {
  created: PlatformTenantCreated | null;
  onClose: () => void;
}): ReactElement {
  const t = useTranslations("app.platform.tenants.created");
  const toast = useToast();

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  return (
    <Dialog
      open={created !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={t("title")}
        size="md"
        footer={
          created && (
            <>
              <Button
                variant="secondary"
                icon={<Copy />}
                onClick={() =>
                  void copy(
                    `${t("username")}: ${created.admin_username}\n${t("password")}: ${created.admin_password}`,
                  )
                }
              >
                {t("copyBoth")}
              </Button>
              <Button onClick={onClose}>{t("done")}</Button>
            </>
          )
        }
      >
        {created && (
          <div className="flex flex-col gap-4">
            <Alert tone="warning" title={t("onceTitle")}>
              {t("body")}
            </Alert>
            <DataList>
              <DataListItem label={t("school")}>{created.tenant.name}</DataListItem>
              <DataListItem label={t("username")}>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono">{created.admin_username}</span>
                  <IconButton
                    size="sm"
                    icon={<Copy />}
                    aria-label={t("copyUsername")}
                    onClick={() => void copy(created.admin_username)}
                  />
                </span>
              </DataListItem>
              <DataListItem label={t("password")}>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono break-all">{created.admin_password}</span>
                  <IconButton
                    size="sm"
                    icon={<Copy />}
                    aria-label={t("copyPassword")}
                    onClick={() => void copy(created.admin_password)}
                  />
                </span>
              </DataListItem>
            </DataList>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
