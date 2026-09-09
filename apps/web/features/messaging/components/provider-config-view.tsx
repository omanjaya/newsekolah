"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, Skeleton, Switch, useToast } from "@newsekolah/ui";
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
    <div className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
      <div>
        <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
        <p className="text-[13px] text-fg-muted">{t("body")}</p>
      </div>

      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("providerLabel")}</span>
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
      </label>

      {form.provider === "meta" ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("meta.phoneNumberIdLabel")}</span>
            <Input
              value={form.phoneNumberId}
              onChange={(e) => {
                setForm((f) => ({ ...f, phoneNumberId: e.target.value }));
              }}
            />
            <span className="text-fg-muted">{t("meta.phoneNumberIdHint")}</span>
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("meta.accessTokenLabel")}</span>
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
          </label>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("gateway.urlLabel")}</span>
            <Input
              value={form.gatewayUrl}
              onChange={(e) => {
                setForm((f) => ({ ...f, gatewayUrl: e.target.value }));
              }}
            />
            <span className="text-fg-muted">{t("gateway.urlHint")}</span>
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("gateway.headerNameLabel")}</span>
            <Input
              value={form.gatewayHeaderName}
              onChange={(e) => {
                setForm((f) => ({ ...f, gatewayHeaderName: e.target.value }));
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("gateway.headerValueLabel")}</span>
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
          </label>
        </div>
      )}

      <label className="flex items-center gap-2 text-[13px]">
        <Switch
          checked={form.isActive}
          onCheckedChange={(checked) => {
            setForm((f) => ({ ...f, isActive: checked }));
          }}
        />
        <span className="font-medium text-fg">{t("activeLabel")}</span>
      </label>
      <p className="text-[13px] text-fg-muted">{t("activeHint")}</p>

      <div>
        <Button onClick={() => void handleSave()} disabled={save.isPending}>
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
