"use client";

import { ApiError } from "@newsekolah/api-client";
import { Field, FormError, FormSection, Input, Select, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { useUpdateProfileMutation } from "../api";

import { ProfileSaveBar } from "./profile-save-bar";

/** The select's value for "no preference": the school's language applies. */
const FOLLOW_SCHOOL = "school";
type LocaleChoice = "id" | "en" | typeof FOLLOW_SCHOOL;

function toLocaleChoice(value: string | undefined): LocaleChoice {
  return value === "id" || value === "en" ? value : FOLLOW_SCHOOL;
}

/**
 * `Me` exposes name, username, email and the language preference (see the
 * schema in packages/api-client's generated types) -- phone is write-only
 * from this screen's point of view, so it starts blank rather than
 * pretending to show a stored value the API never sends back. The language
 * select shows the stored preference, or "use the school's language" when
 * the user never chose one, and is sent only when it changed, so saving
 * another field never overwrites it. Going back to the school's language
 * sends an empty locale, which clears the preference. Once saved,
 * `UserLocaleSync` switches the app. The save bar rises once a field
 * changed.
 */
export function EditProfileForm(): ReactElement | null {
  const { me } = useSession();
  const t = useTranslations("app.profile.edit");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const update = useUpdateProfileMutation();

  const initialLocale = toLocaleChoice(me?.locale);
  const [username, setUsername] = useState(me?.username ?? "");
  const [name, setName] = useState(me?.name ?? "");
  const [email, setEmail] = useState(me?.email ?? "");
  const [phone, setPhone] = useState("");
  const [locale, setLocale] = useState<LocaleChoice>(initialLocale);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; username?: string }>({});

  if (!me) return null;

  const dirty =
    username !== me.username ||
    name !== me.name ||
    email !== (me.email ?? "") ||
    phone !== "" ||
    locale !== initialLocale;

  async function submit() {
    setError(null);
    const nextErrors = {
      ...(!name.trim() ? { name: t("requiredError") } : {}),
      ...(username.trim().length < 3 ? { username: t("usernameLengthError") } : {}),
    };
    setFieldErrors(nextErrors);
    if (nextErrors.name ?? nextErrors.username) return;
    try {
      await update.mutateAsync({
        ...(username.trim() !== me?.username ? { username: username.trim() } : {}),
        name: name.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(locale !== initialLocale ? { locale: locale === FOLLOW_SCHOOL ? "" : locale } : {}),
      });
      setPhone("");
      toast.success(t("saved"));
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error && <FormError>{error}</FormError>}
      <FormSection variant="card" title={t("title")} description={t("description")}>
        <Field label={t("nameLabel")} error={fieldErrors.name} required>
          <Input
            value={name}
            autoComplete="name"
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </Field>
        <Field label={t("usernameLabel")} error={fieldErrors.username} required>
          <Input
            value={username}
            autoComplete="username"
            maxLength={80}
            onChange={(e) => {
              setUsername(e.target.value);
            }}
          />
        </Field>
        <Field label={t("emailLabel")}>
          <Input
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
        </Field>
        <Field label={t("phoneLabel")} hint={t("phoneHint")}>
          <Input
            type="tel"
            value={phone}
            autoComplete="tel"
            placeholder={t("phonePlaceholder")}
            onChange={(e) => {
              setPhone(e.target.value);
            }}
          />
        </Field>
        <Field label={t("localeLabel")}>
          <Select
            options={[
              { value: FOLLOW_SCHOOL, label: t("localeSchool") },
              { value: "id", label: t("localeId") },
              { value: "en", label: t("localeEn") },
            ]}
            value={locale}
            onValueChange={(v) => {
              setLocale(toLocaleChoice(v));
            }}
          />
        </Field>
      </FormSection>
      <ProfileSaveBar
        dirty={dirty}
        saving={update.isPending}
        saveLabel={t("save")}
        onSave={() => void submit()}
      />
    </form>
  );
}
