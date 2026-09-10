"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, useToast } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { useUpdateProfileMutation } from "../api";

/**
 * `Me` only exposes name, username and email (see the schema in
 * packages/api-client's generated types) -- phone and locale are
 * write-only from this screen's point of view, so those two fields start
 * blank/at the current UI locale rather than pretending to show a stored
 * value the API never sends back.
 */
export function EditProfileForm(): ReactElement | null {
  const { me } = useSession();
  const t = useTranslations("app.profile.edit");
  const uiLocale = useLocale();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const update = useUpdateProfileMutation();

  const [name, setName] = useState(me?.name ?? "");
  const [email, setEmail] = useState(me?.email ?? "");
  const [phone, setPhone] = useState("");
  const [locale, setLocale] = useState<"id" | "en">(uiLocale === "en" ? "en" : "id");
  const [error, setError] = useState<string | null>(null);

  if (!me) return null;

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError(t("requiredError"));
      return;
    }
    try {
      await update.mutateAsync({
        name: name.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        locale,
      });
      toast.success(t("saved"));
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  return (
    <form
      className="flex max-w-sm flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error && (
        <p role="alert" className="rounded-xs border border-status-late/40 px-3 py-2 text-[13px]">
          {error}
        </p>
      )}
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("nameLabel")}</span>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("emailLabel")}</span>
        <Input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("phoneLabel")}</span>
        <Input
          type="tel"
          value={phone}
          placeholder={t("phonePlaceholder")}
          onChange={(e) => {
            setPhone(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("localeLabel")}</span>
        <Select
          options={[
            { value: "id", label: t("localeId") },
            { value: "en", label: t("localeEn") },
          ]}
          value={locale}
          onValueChange={(v) => {
            setLocale(v === "en" ? "en" : "id");
          }}
        />
      </label>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={update.isPending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
