"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, Skeleton } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type SchoolProfileWrite,
  type TenantBranding,
  useTenantBrandingQuery,
  useUpdateSchoolProfileMutation,
} from "../api";

const TIMEZONES = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"];

type EducationLevel = SchoolProfileWrite["education_level"];
const EDUCATION_LEVELS: EducationLevel[] = ["sd", "smp", "sma", "smk", "other"];
type Locale = SchoolProfileWrite["locale"];
const LOCALES: Locale[] = ["id", "en"];

/**
 * First onboarding step, inline on the setup page rather than a separate
 * route (docs/07-ui-ux.md section 4, "wizard 6 langkah"). `getTenantBranding`
 * does not report the tenant's education level, so that field always starts
 * blank and is required before saving.
 */
export function SchoolProfileSection(): ReactElement {
  const t = useTranslations("app.onboarding.profile");
  const branding = useTenantBrandingQuery();

  return (
    <section
      id="school-profile"
      className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
        <p className="text-[13px] text-fg-muted">{t("body")}</p>
      </div>
      {branding.isLoading || !branding.data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <SchoolProfileForm key={branding.dataUpdatedAt} initial={branding.data} />
      )}
    </section>
  );
}

function SchoolProfileForm({ initial }: { initial: TenantBranding }): ReactElement {
  const t = useTranslations("app.onboarding.profile");
  const tLevels = useTranslations("app.onboarding.levels");
  const tLocales = useTranslations("app.onboarding.locales");
  const apiErrorMessage = useApiErrorMessage();
  const update = useUpdateSchoolProfileMutation();
  const [name, setName] = useState(initial.name);
  const [educationLevel, setEducationLevel] = useState<EducationLevel | "">("");
  const [timezone, setTimezone] = useState(initial.timezone);
  const [locale, setLocale] = useState<Locale>(initial.locale);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit() {
    setSaved(false);
    if (!name.trim() || !educationLevel) {
      setError(t("requiredError"));
      return;
    }
    setError(null);
    try {
      await update.mutateAsync({
        name: name.trim(),
        education_level: educationLevel,
        timezone,
        locale,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error && (
        <p role="alert" className="rounded-xs border border-status-absent/40 px-3 py-2 text-[13px]">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="text-[13px] text-fg-muted">
          {t("saved")}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("name")}</span>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("educationLevel")}</span>
          <Select
            options={EDUCATION_LEVELS.map((level) => ({ value: level, label: tLevels(level) }))}
            value={educationLevel}
            onValueChange={(value) => {
              setEducationLevel(value as EducationLevel);
            }}
            placeholder={t("pick")}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("timezone")}</span>
          <Select
            options={TIMEZONES.map((zone) => ({ value: zone, label: zone }))}
            value={timezone}
            onValueChange={setTimezone}
            placeholder={t("pick")}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("language")}</span>
          <Select
            options={LOCALES.map((code) => ({ value: code, label: tLocales(code) }))}
            value={locale}
            onValueChange={(value) => {
              setLocale(value as Locale);
            }}
            placeholder={t("pick")}
          />
        </label>
      </div>
      <div>
        <Button type="submit" size="sm" loading={update.isPending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
