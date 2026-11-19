"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Badge,
  ConfirmDialog,
  Field,
  FormSection,
  Input,
  PasswordInput,
  SkeletonForm,
  useToast,
} from "@newsekolah/ui";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { SettingSwitchRow } from "../../settings/components/setting-switch-row";
import { SettingsPage } from "../../settings/components/settings-page";
import { SettingsSaveBar } from "../../settings/components/settings-save-bar";
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

const NAV_KEY = "settings-sso";

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
  const [submitted, setSubmitted] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  if (config.isError && !config.data) {
    return (
      <SettingsPage navKey={NAV_KEY} description={t("description")}>
        <QueryError retry={() => config.refetch()} error={config.error} />
      </SettingsPage>
    );
  }

  if (config.isLoading || !config.data) {
    return (
      <SettingsPage navKey={NAV_KEY} description={t("description")}>
        <SkeletonForm fields={3} actions={false} />
      </SettingsPage>
    );
  }

  const data = config.data;
  const saved: FormState = {
    clientId: data.client_id ?? "",
    clientSecret: "",
    hostedDomain: data.hosted_domain ?? "",
    // Before the first configuration there is nothing to switch: saving
    // the credentials turns sign-in on.
    enabled: data.configured ? data.enabled : true,
  };
  const active = form ?? saved;
  const dirty = JSON.stringify(active) !== JSON.stringify(saved);
  const clientIdError = submitted && !active.clientId.trim() ? t("clientIdRequired") : undefined;
  const domainError =
    submitted && !active.hostedDomain.trim() ? t("hostedDomainRequired") : undefined;
  // The first save must carry a secret; afterwards an empty field keeps
  // the stored one (sso_google.go googleSSOSecretToStore).
  const secretRequired = !data.configured;
  const secretMissing = secretRequired && !active.clientSecret.trim();
  const clientSecretError = submitted && secretMissing ? t("clientSecretRequired") : undefined;

  async function handleSave() {
    setSubmitted(true);
    if (!active.clientId.trim() || !active.hostedDomain.trim() || secretMissing) return;
    try {
      await save.mutateAsync({
        client_id: active.clientId.trim(),
        client_secret: active.clientSecret.trim() || undefined,
        hosted_domain: active.hostedDomain.trim(),
        enabled: active.enabled,
      });
      setForm(null);
      setSubmitted(false);
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

  const statusBadge = !data.configured ? (
    <Badge tone="neutral">{t("statusUnset")}</Badge>
  ) : data.enabled ? (
    <Badge tone="success">{t("statusOn")}</Badge>
  ) : (
    <Badge tone="neutral">{t("statusOff")}</Badge>
  );

  return (
    <SettingsPage
      navKey={NAV_KEY}
      description={t("description")}
      // The state of the feature belongs to the page, beside its title.
      actions={statusBadge}
      secondaryActions={
        data.configured
          ? [
              {
                label: t("removeAction"),
                icon: <Trash2 />,
                destructive: true,
                onSelect: () => {
                  setShowRemoveConfirm(true);
                },
              },
            ]
          : undefined
      }
      floating={
        <SettingsSaveBar
          dirty={dirty}
          saving={save.isPending}
          saveLabel={data.configured ? undefined : t("saveAndEnable")}
          onSave={() => void handleSave()}
          onDiscard={() => {
            setForm(null);
            setSubmitted(false);
          }}
        />
      }
    >
      {/* The switch has nothing to switch before the first save, so its
          card appears only once the credentials are stored. */}
      {data.configured && (
        <FormSection variant="card" columns={1} title={t("statusTitle")}>
          <SettingSwitchRow
            label={t("enabledToggleLabel")}
            hint={t("statusBody")}
            checked={active.enabled}
            onCheckedChange={(enabled) => {
              setForm({ ...active, enabled });
            }}
          />
        </FormSection>
      )}

      <FormSection
        variant="card"
        columns={1}
        title={t("credentialsTitle")}
        description={t("credentialsHint")}
      >
        {!data.configured && <Alert tone="info">{t("neverConfigured")}</Alert>}
        <Field label={t("clientIdLabel")} required hint={t("clientIdHint")} error={clientIdError}>
          <Input
            value={active.clientId}
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => {
              setForm({ ...active, clientId: event.target.value });
            }}
          />
        </Field>
        <Field
          label={t("clientSecretLabel")}
          required={secretRequired}
          hint={data.configured ? t("clientSecretHint") : undefined}
          error={clientSecretError}
        >
          <PasswordInput
            value={active.clientSecret}
            autoComplete="off"
            placeholder={data.configured ? t("clientSecretUnchangedPlaceholder") : ""}
            onChange={(event) => {
              setForm({ ...active, clientSecret: event.target.value });
            }}
          />
        </Field>
        <Field
          label={t("hostedDomainLabel")}
          required
          hint={t("hostedDomainHint")}
          error={domainError}
        >
          <Input
            value={active.hostedDomain}
            placeholder={t("hostedDomainPlaceholder")}
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => {
              setForm({ ...active, hostedDomain: event.target.value });
            }}
          />
        </Field>
      </FormSection>

      <ConfirmDialog
        open={showRemoveConfirm}
        onOpenChange={setShowRemoveConfirm}
        title={t("removeDialogTitle")}
        description={t("removeDialogBody")}
        confirmLabel={t("removeAction")}
        tone="danger"
        confirming={remove.isPending}
        onConfirm={() => void handleRemove()}
      />
    </SettingsPage>
  );
}
