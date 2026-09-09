"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Input,
  PageHeader,
  Skeleton,
  Switch,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  useGoogleSSOConfigQuery,
  useRemoveGoogleSSOConfigMutation,
  useSaveGoogleSSOConfigMutation,
} from "../api";

interface FormState {
  clientId: string;
  clientSecret: string;
  hostedDomain: string;
  enabled: boolean;
}

/**
 * Admin screen for Google Workspace SSO: a school supplies the OAuth 2.0
 * client id and secret from its own Google Cloud project, plus the
 * Workspace domain (the "hd" claim) an account's email must belong to.
 * The client secret is write-only -- once saved it is never shown again,
 * matching how the TOTP secret and other credentials in this app behave.
 */
export function SsoView(): ReactElement {
  const t = useTranslations("app.sso");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const config = useGoogleSSOConfigQuery();
  const save = useSaveGoogleSSOConfigMutation();
  const remove = useRemoveGoogleSSOConfigMutation();

  const [form, setForm] = useState<FormState | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  if (config.isLoading || !config.data) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
        <Skeleton className="h-64 w-full max-w-lg" />
      </div>
    );
  }

  const data = config.data;
  const active =
    form ??
    ({
      clientId: data.client_id ?? "",
      clientSecret: "",
      hostedDomain: data.hosted_domain ?? "",
      enabled: data.configured ? data.enabled : true,
    } satisfies FormState);

  async function handleSave() {
    if (!active.clientId.trim() || !active.hostedDomain.trim()) {
      toast.error(t("validationRequired"));
      return;
    }
    try {
      await save.mutateAsync({
        client_id: active.clientId.trim(),
        client_secret: active.clientSecret.trim() || undefined,
        hosted_domain: active.hostedDomain.trim(),
        enabled: active.enabled,
      });
      setForm(null);
      toast.success(t("toasts.saved"));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  async function handleRemove() {
    try {
      await remove.mutateAsync();
      setForm(null);
      setShowRemoveConfirm(false);
      toast.success(t("toasts.removed"));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="max-w-lg text-[13px] text-fg-muted">{t("description")}</p>

      <section className="flex max-w-lg flex-col gap-4 rounded-sm border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h2 className="text-[16px] font-medium text-fg">{t("statusTitle")}</h2>
              <Badge variant={data.configured && data.enabled ? "accent" : "neutral"}>
                {data.configured && data.enabled ? t("statusOn") : t("statusOff")}
              </Badge>
            </div>
            <p className="text-[13px] text-fg-muted">{t("statusBody")}</p>
          </div>
          <Switch
            checked={active.enabled}
            onCheckedChange={(enabled) => {
              setForm({ ...active, enabled });
            }}
            aria-label={t("enabledToggleLabel")}
          />
        </div>

        {!data.configured && <Alert variant="info" title={t("neverConfigured")} />}

        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("clientIdLabel")}</span>
          <Input
            value={active.clientId}
            placeholder={t("clientIdPlaceholder")}
            onChange={(event) => {
              setForm({ ...active, clientId: event.target.value });
            }}
          />
        </label>

        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("clientSecretLabel")}</span>
          <Input
            type="password"
            value={active.clientSecret}
            placeholder={data.configured ? t("clientSecretUnchangedPlaceholder") : ""}
            onChange={(event) => {
              setForm({ ...active, clientSecret: event.target.value });
            }}
          />
          <span className="text-[12px] text-fg-muted">{t("clientSecretHint")}</span>
        </label>

        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("hostedDomainLabel")}</span>
          <Input
            value={active.hostedDomain}
            placeholder={t("hostedDomainPlaceholder")}
            onChange={(event) => {
              setForm({ ...active, hostedDomain: event.target.value });
            }}
          />
          <span className="text-[12px] text-fg-muted">{t("hostedDomainHint")}</span>
        </label>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={save.isPending} onClick={() => void handleSave()}>
            {t("saveAction")}
          </Button>
          {data.configured && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setShowRemoveConfirm(true);
              }}
            >
              {t("removeAction")}
            </Button>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={showRemoveConfirm}
        onOpenChange={setShowRemoveConfirm}
        title={t("removeDialogTitle")}
        description={t("removeDialogBody")}
        confirmLabel={t("removeAction")}
        destructive
        confirming={remove.isPending}
        onConfirm={() => void handleRemove()}
      />
    </div>
  );
}
