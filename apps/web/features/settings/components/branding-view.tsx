"use client";

import { ApiError } from "@newsekolah/api-client";
import { useTenantBranding } from "@newsekolah/api-client/react";
import { Field, FormError, FormSection, Input, SkeletonForm, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiClient } from "../../../lib/api/client";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type BrandingWrite, type TenantBranding, useUpdateBrandingMutation } from "../api";

import { BrandAssetUpload } from "./brand-asset-upload";
import { BrandingPreview } from "./branding-preview";
import { PreviewSheet } from "./preview-sheet";
import { SettingsPage } from "./settings-page";
import { SettingsSaveBar } from "./settings-save-bar";

const ACCENT_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const NAV_KEY = "settings-branding";

/**
 * School name, short name, tagline and accent color (PUT /v1/tenant/branding),
 * plus logo and favicon upload. Reads through the same `useTenantBranding`
 * cache entry the app shell uses to inject --color-accent and the page
 * title, so a save here updates the whole app, not just this screen.
 */
export function BrandingView(): ReactElement {
  const client = useApiClient();
  const { data, isLoading, isError, error, refetch } = useTenantBranding(client);

  if (isError && !data) {
    return (
      <SettingsPage navKey={NAV_KEY}>
        <QueryError retry={() => refetch()} error={error} />
      </SettingsPage>
    );
  }

  if (isLoading || !data) {
    return (
      <SettingsPage navKey={NAV_KEY} variant="default">
        <div aria-busy="true" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <SkeletonForm fields={4} actions={false} />
          <SkeletonForm fields={3} actions={false} className="hidden lg:flex" />
        </div>
      </SettingsPage>
    );
  }

  return <BrandingForm initial={data} />;
}

interface BrandingValues {
  name: string;
  shortName: string;
  tagline: string;
  accentColor: string;
}

function valuesOf(branding: TenantBranding): BrandingValues {
  return {
    name: branding.name,
    shortName: branding.short_name ?? "",
    tagline: branding.tagline ?? "",
    accentColor: branding.accent_color,
  };
}

/**
 * Two panes: the form on the left, a live preview of the unsaved values on
 * the right (it stays in view on a desktop; on a phone it follows the
 * form). Name, tagline and colour save from the bar at the bottom edge;
 * logo and favicon save as soon as they are uploaded.
 */
function BrandingForm({ initial }: { initial: TenantBranding }): ReactElement {
  const t = useTranslations("app.settings.branding");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const update = useUpdateBrandingMutation();

  const saved = valuesOf(initial);
  const [values, setValues] = useState<BrandingValues>(saved);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    values.name !== saved.name ||
    values.shortName !== saved.shortName ||
    values.tagline !== saved.tagline ||
    values.accentColor.toUpperCase() !== saved.accentColor.toUpperCase();
  const nameError = submitted && !values.name.trim() ? t("nameRequiredError") : undefined;
  const accentValid = ACCENT_PATTERN.test(values.accentColor);
  const accentError =
    values.accentColor !== "" && !accentValid && (submitted || values.accentColor.length >= 7)
      ? t("accentColorError")
      : undefined;

  function set<K extends keyof BrandingValues>(key: K, value: BrandingValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function save() {
    setSubmitted(true);
    setError(null);
    if (!values.name.trim() || !accentValid) return;
    const body: BrandingWrite = {
      name: values.name.trim(),
      accent_color: values.accentColor,
      ...(values.shortName.trim() ? { short_name: values.shortName.trim() } : {}),
      ...(values.tagline.trim() ? { tagline: values.tagline.trim() } : {}),
    };
    update.mutate(body, {
      onSuccess: (data) => {
        setValues(valuesOf(data));
        setSubmitted(false);
        toast.success(t("saved"));
      },
      onError: (err) => {
        setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
      },
    });
  }

  return (
    <SettingsPage
      navKey={NAV_KEY}
      variant="default"
      description={t("description")}
      floating={
        <SettingsSaveBar
          container="default"
          dirty={dirty}
          saving={update.isPending}
          onSave={save}
          onDiscard={() => {
            setValues(saved);
            setSubmitted(false);
            setError(null);
          }}
        />
      }
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {error && <FormError>{error}</FormError>}
          <PreviewSheet label={t("preview.title")}>
            <BrandingPreview
              name={values.name}
              shortName={values.shortName}
              tagline={values.tagline}
              accent={accentValid ? values.accentColor : saved.accentColor}
              logoUrl={initial.logo_url}
              faviconUrl={initial.favicon_url}
            />
          </PreviewSheet>
          <FormSection variant="card" title={t("identityTitle")}>
            <Field label={t("nameLabel")} required error={nameError}>
              <Input
                value={values.name}
                onChange={(e) => {
                  set("name", e.target.value);
                }}
                maxLength={160}
              />
            </Field>
            <Field label={t("shortNameLabel")} optional hint={t("shortNameHint")}>
              <Input
                value={values.shortName}
                onChange={(e) => {
                  set("shortName", e.target.value);
                }}
                maxLength={40}
              />
            </Field>
            <Field
              label={t("taglineLabel")}
              optional
              hint={t("taglineHint")}
              className="col-span-full"
            >
              <Input
                value={values.tagline}
                onChange={(e) => {
                  set("tagline", e.target.value);
                }}
                maxLength={200}
              />
            </Field>
          </FormSection>

          <FormSection variant="card" title={t("colorTitle")} description={t("accentColorHint")}>
            <Field label={t("accentColorLabel")} error={accentError} hint={t("accentColorFormat")}>
              <Input
                value={values.accentColor}
                onChange={(e) => {
                  set("accentColor", e.target.value.trim());
                }}
                maxLength={7}
                inputClassName="font-mono uppercase"
                className="sm:w-56"
                leading={
                  // The swatch is the system colour picker: a tap opens it,
                  // and the field beside it takes a typed hex code.
                  <input
                    type="color"
                    aria-label={t("accentColorPicker")}
                    value={accentValid ? values.accentColor.toLowerCase() : "#0f7a5f"}
                    onChange={(e) => {
                      set("accentColor", e.target.value.toUpperCase());
                    }}
                    className="size-6 shrink-0 cursor-pointer appearance-none rounded-full border border-border-strong bg-transparent p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                  />
                }
              />
            </Field>
          </FormSection>

          <FormSection
            variant="card"
            columns={1}
            title={t("assetsTitle")}
            description={t("assetsDescription")}
          >
            <BrandAssetUpload kind="logo" currentUrl={initial.logo_url} />
            <BrandAssetUpload kind="favicon" currentUrl={initial.favicon_url} />
          </FormSection>
        </div>

        <div className="max-lg:hidden lg:sticky lg:top-[calc(var(--shell-header-height,3.5rem)+1.5rem)]">
          <BrandingPreview
            name={values.name}
            shortName={values.shortName}
            tagline={values.tagline}
            accent={accentValid ? values.accentColor : saved.accentColor}
            logoUrl={initial.logo_url}
            faviconUrl={initial.favicon_url}
          />
        </div>
      </div>
    </SettingsPage>
  );
}
