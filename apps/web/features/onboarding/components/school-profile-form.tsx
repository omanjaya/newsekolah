"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Skeleton,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
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
 * reports the tenant's education level once the profile step has been
 * saved at least once, preselecting it here; it is still required before
 * saving so a school cannot clear it.
 */
export function SchoolProfileSection(): ReactElement {
  const t = useTranslations("app.onboarding.profile");
  const branding = useTenantBrandingQuery();

  return (
    <Card id="school-profile" padding="md" className="scroll-mt-20">
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      {branding.isError && !branding.data ? (
        <QueryError retry={() => branding.refetch()} />
      ) : branding.isLoading || !branding.data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <SchoolProfileForm key={branding.dataUpdatedAt} initial={branding.data} />
      )}
    </Card>
  );
}

function SchoolProfileForm({ initial }: { initial: TenantBranding }): ReactElement {
  const t = useTranslations("app.onboarding.profile");
  const tLevels = useTranslations("app.onboarding.levels");
  const tLocales = useTranslations("app.onboarding.locales");
  const apiErrorMessage = useApiErrorMessage();
  const update = useUpdateSchoolProfileMutation();
  const [name, setName] = useState(initial.name);
  const [educationLevel, setEducationLevel] = useState<EducationLevel | "">(
    initial.education_level ?? "",
  );
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
      {error && <Alert tone="danger" title={error} />}
      {saved && !error && <Alert tone="success" title={t("saved")} />}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("name")}>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            required
          />
        </Field>
        <Field label={t("educationLevel")}>
          <Select
            options={EDUCATION_LEVELS.map((level) => ({ value: level, label: tLevels(level) }))}
            value={educationLevel}
            onValueChange={(value) => {
              setEducationLevel(value as EducationLevel);
            }}
            placeholder={t("pick")}
          />
        </Field>
        <Field label={t("timezone")}>
          <Select
            options={TIMEZONES.map((zone) => ({ value: zone, label: zone }))}
            value={timezone}
            onValueChange={setTimezone}
            placeholder={t("pick")}
          />
        </Field>
        <Field label={t("language")}>
          <Select
            options={LOCALES.map((code) => ({ value: code, label: tLocales(code) }))}
            value={locale}
            onValueChange={(value) => {
              setLocale(value as Locale);
            }}
            placeholder={t("pick")}
          />
        </Field>
      </div>
      <div>
        <Button type="submit" size="sm" loading={update.isPending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
