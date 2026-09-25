"use client";

import { ApiError } from "@newsekolah/api-client";
import { useTenantBranding } from "@newsekolah/api-client/react";
import { Button, Input, PageHeader, Skeleton, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiClient } from "../../../lib/api/client";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type BrandingWrite, type TenantBranding, useUpdateBrandingMutation } from "../api";

import { BrandAssetUpload } from "./brand-asset-upload";

const ACCENT_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/**
 * School name, short name, tagline and accent color (PUT /v1/tenant/branding),
 * plus logo and favicon upload. Reads through the same `useTenantBranding`
 * cache entry the app shell uses to inject --color-accent and the page
 * title, so a save here updates the whole app, not just this screen.
 */
export function BrandingView(): ReactElement {
  const t = useTranslations("app.settings.branding");
  const client = useApiClient();
  const { data, isLoading, isError, refetch } = useTenantBranding(client);

  if (isError && !data) return <QueryError retry={() => refetch()} className="m-4" />;

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6" aria-busy="true">
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return <BrandingForm initial={data} />;
}

function BrandingForm({ initial }: { initial: TenantBranding }): ReactElement {
  const t = useTranslations("app.settings.branding");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const update = useUpdateBrandingMutation();

  const [name, setName] = useState(initial.name);
  const [shortName, setShortName] = useState(initial.short_name ?? "");
  const [tagline, setTagline] = useState(initial.tagline ?? "");
  const [accentColor, setAccentColor] = useState(initial.accent_color);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name !== initial.name ||
    shortName !== (initial.short_name ?? "") ||
    tagline !== (initial.tagline ?? "") ||
    accentColor !== initial.accent_color;

  function save() {
    setError(null);
    if (!name.trim()) {
      setError(t("nameRequiredError"));
      return;
    }
    if (!ACCENT_PATTERN.test(accentColor)) {
      setError(t("accentColorError"));
      return;
    }
    const body: BrandingWrite = {
      name: name.trim(),
      accent_color: accentColor,
      ...(shortName.trim() ? { short_name: shortName.trim() } : {}),
      ...(tagline.trim() ? { tagline: tagline.trim() } : {}),
    };
    update.mutate(body, {
      onSuccess: () => {
        toast.success(t("saved"));
      },
      onError: (err) => {
        setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
      },
    });
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      <section className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
        <h2 className="text-[16px] font-medium text-fg">{t("identityTitle")}</h2>
        {error && (
          <p role="alert" className="rounded-xs border border-status-late/40 px-3 py-2 text-[13px]">
            {error}
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("nameLabel")}</span>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              maxLength={160}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("shortNameLabel")}</span>
            <Input
              value={shortName}
              onChange={(e) => {
                setShortName(e.target.value);
              }}
              maxLength={40}
              placeholder={t("shortNamePlaceholder")}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] md:col-span-2">
            <span className="font-medium text-fg">{t("taglineLabel")}</span>
            <Input
              value={tagline}
              onChange={(e) => {
                setTagline(e.target.value);
              }}
              maxLength={200}
              placeholder={t("taglinePlaceholder")}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("accentColorLabel")}</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={ACCENT_PATTERN.test(accentColor) ? accentColor : "#0f7a5f"}
                onChange={(e) => {
                  setAccentColor(e.target.value);
                }}
                aria-label={t("accentColorLabel")}
                className="h-9 w-9 shrink-0 cursor-pointer rounded-xs border border-border bg-surface p-0.5"
              />
              <Input
                value={accentColor}
                onChange={(e) => {
                  setAccentColor(e.target.value);
                }}
                placeholder="#0F7A5F"
                className="w-32"
              />
            </div>
            <span className="text-fg-muted">{t("accentColorHint")}</span>
          </label>
        </div>
        <div className="flex justify-end border-t border-border pt-4">
          <Button disabled={!dirty} loading={update.isPending} onClick={save}>
            {t("save")}
          </Button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <BrandAssetUpload kind="logo" currentUrl={initial.logo_url} />
        <BrandAssetUpload kind="favicon" currentUrl={initial.favicon_url} />
      </div>
    </div>
  );
}
