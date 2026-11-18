"use client";

import { Field, FormSection, Input, PasswordInput, Select, SkeletonForm } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { SettingSwitchRow } from "../../settings/components/setting-switch-row";
import type { WhatsAppProviderKind } from "../api";

import type { ProviderConfigForm } from "./use-provider-config-form";

/**
 * The WhatsApp delivery provider: Meta Cloud API or the school's own
 * gateway, its credentials, and the switch that turns delivery on. The
 * page owns the form state (`useProviderConfigForm`) and saves it from the
 * settings save bar; the tab already names the panel, so the card only
 * explains it. Tokens are write-only, as on the SSO page: once saved the
 * field reads "Tidak diubah" and a blank value keeps what is stored.
 */
export function ProviderConfigView({
  controller,
}: {
  controller: ProviderConfigForm;
}): ReactElement {
  const t = useTranslations("app.messaging.provider");
  const { query, form, update } = controller;

  if (query.isError && !query.data) {
    return <QueryError retry={() => query.refetch()} error={query.error} />;
  }
  if (query.isLoading || !query.data) {
    return <SkeletonForm fields={4} actions={false} />;
  }
  const status = query.data;

  return (
    <FormSection variant="card" columns={1} description={t("body")}>
      <Field label={t("providerLabel")}>
        <Select
          value={form.provider}
          onValueChange={(value) => {
            update({ provider: value as WhatsAppProviderKind });
          }}
          options={[
            { value: "meta", label: t("providerMeta") },
            { value: "gateway", label: t("providerGateway") },
          ]}
        />
      </Field>

      {form.provider === "meta" ? (
        <>
          <Field label={t("meta.phoneNumberIdLabel")} hint={t("meta.phoneNumberIdHint")}>
            <Input
              value={form.phoneNumberId}
              onChange={(e) => {
                update({ phoneNumberId: e.target.value });
              }}
            />
          </Field>
          <Field
            label={t("meta.accessTokenLabel")}
            hint={status.has_access_token ? t("meta.accessTokenKeepHint") : undefined}
          >
            <PasswordInput
              value={form.accessToken}
              autoComplete="off"
              placeholder={status.has_access_token ? t("unchangedPlaceholder") : ""}
              onChange={(e) => {
                update({ accessToken: e.target.value });
              }}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label={t("gateway.urlLabel")} hint={t("gateway.urlHint")}>
            <Input
              value={form.gatewayUrl}
              onChange={(e) => {
                update({ gatewayUrl: e.target.value });
              }}
            />
          </Field>
          <Field label={t("gateway.headerNameLabel")}>
            <Input
              value={form.gatewayHeaderName}
              onChange={(e) => {
                update({ gatewayHeaderName: e.target.value });
              }}
            />
          </Field>
          <Field
            label={t("gateway.headerValueLabel")}
            hint={status.has_gateway_header ? t("gateway.headerValueKeepHint") : undefined}
          >
            <PasswordInput
              value={form.gatewayHeaderValue}
              autoComplete="off"
              placeholder={status.has_gateway_header ? t("unchangedPlaceholder") : ""}
              onChange={(e) => {
                update({ gatewayHeaderValue: e.target.value });
              }}
            />
          </Field>
        </>
      )}

      <SettingSwitchRow
        label={t("activeLabel")}
        hint={t("activeHint")}
        checked={form.isActive}
        onCheckedChange={(isActive) => {
          update({ isActive });
        }}
      />
    </FormSection>
  );
}
