"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FormActions,
  Input,
  Select,
  Skeleton,
  Switch,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  useSetWhatsAppProviderConfigMutation,
  useWhatsAppProviderConfigQuery,
  type WhatsAppProviderKind,
  type WhatsAppProviderStatus,
} from "../api";

interface FormState {
  provider: WhatsAppProviderKind;
  phoneNumberId: string;
  accessToken: string;
  gatewayUrl: string;
  gatewayHeaderName: string;
  gatewayHeaderValue: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  provider: "meta",
  phoneNumberId: "",
  accessToken: "",
  gatewayUrl: "",
  gatewayHeaderName: "",
  gatewayHeaderValue: "",
  isActive: false,
};

export function ProviderConfigView(): ReactElement {
  const t = useTranslations("app.messaging.provider");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const query = useWhatsAppProviderConfigQuery();
  const save = useSetWhatsAppProviderConfigMutation();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // Tracks which loaded status the form was last initialized from, so a
  // fresh GET result (e.g. after a save) re-seeds the form exactly once,
  // set during render rather than in an effect (React's recommended
  // pattern for state derived from a prop/query, per react-hooks/set-state-in-effect).
  const [seededFrom, setSeededFrom] = useState<WhatsAppProviderStatus | undefined>(undefined);

  const status = query.data;
  if (status && status !== seededFrom) {
    setSeededFrom(status);
    setForm({
      provider: status.provider,
      phoneNumberId: status.phone_number_id ?? "",
      accessToken: "",
      gatewayUrl: status.gateway_url ?? "",
      gatewayHeaderName: status.gateway_header_name ?? "",
      gatewayHeaderValue: "",
      isActive: status.is_active,
    });
  }

  if (query.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  async function handleSave() {
    try {
      await save.mutateAsync({
        provider: form.provider,
        phone_number_id: form.phoneNumberId || undefined,
        access_token: form.accessToken || undefined,
        gateway_url: form.gatewayUrl || undefined,
        gateway_header_name: form.gatewayHeaderName || undefined,
        gateway_header_value: form.gatewayHeaderValue || undefined,
        is_active: form.isActive,
      });
      toast.success(t("saved"));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  return (
    <Card padding="md">
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>

      <Field label={t("providerLabel")}>
        <Select
          value={form.provider}
          onValueChange={(value) => {
            setForm((f) => ({ ...f, provider: value as WhatsAppProviderKind }));
          }}
          options={[
            { value: "meta", label: t("providerMeta") },
            { value: "gateway", label: t("providerGateway") },
          ]}
        />
      </Field>

      {form.provider === "meta" ? (
        <div className="flex flex-col gap-3">
          <Field label={t("meta.phoneNumberIdLabel")} hint={t("meta.phoneNumberIdHint")}>
            <Input
              value={form.phoneNumberId}
              onChange={(e) => {
                setForm((f) => ({ ...f, phoneNumberId: e.target.value }));
              }}
            />
          </Field>
          <Field label={t("meta.accessTokenLabel")}>
            <Input
              type="password"
              value={form.accessToken}
              onChange={(e) => {
                setForm((f) => ({ ...f, accessToken: e.target.value }));
              }}
              placeholder={
                status?.has_access_token
                  ? t("meta.accessTokenPlaceholderSet")
                  : t("meta.accessTokenPlaceholderUnset")
              }
            />
          </Field>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label={t("gateway.urlLabel")} hint={t("gateway.urlHint")}>
            <Input
              value={form.gatewayUrl}
              onChange={(e) => {
                setForm((f) => ({ ...f, gatewayUrl: e.target.value }));
              }}
            />
          </Field>
          <Field label={t("gateway.headerNameLabel")}>
            <Input
              value={form.gatewayHeaderName}
              onChange={(e) => {
                setForm((f) => ({ ...f, gatewayHeaderName: e.target.value }));
              }}
            />
          </Field>
          <Field label={t("gateway.headerValueLabel")}>
            <Input
              type="password"
              value={form.gatewayHeaderValue}
              onChange={(e) => {
                setForm((f) => ({ ...f, gatewayHeaderValue: e.target.value }));
              }}
              placeholder={
                status?.has_gateway_header
                  ? t("gateway.headerValuePlaceholderSet")
                  : t("gateway.headerValuePlaceholderUnset")
              }
            />
          </Field>
        </div>
      )}

      <Field label={t("activeLabel")} hint={t("activeHint")} orientation="horizontal">
        <Switch
          checked={form.isActive}
          onCheckedChange={(checked) => {
            setForm((f) => ({ ...f, isActive: checked }));
          }}
        />
      </Field>

      <FormActions>
        <Button onClick={() => void handleSave()} loading={save.isPending}>
          {t("save")}
        </Button>
      </FormActions>
    </Card>
  );
}
