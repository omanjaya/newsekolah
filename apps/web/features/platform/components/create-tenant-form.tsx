"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, DialogFooter, Field, FormError, FormSection, Input, Select } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type PlatformTenantCreated, useCreateTenantMutation } from "../api";

import { EDUCATION_LEVELS, SCHOOL_TIME_ZONES } from "./tenant-status";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `SMA Negeri 1 Denpasar` becomes `sma-negeri-1-denpasar`. */
export function tenantSlugFrom(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The body of the "Tambah sekolah" dialog; its actions sit in the dialog's footer. */
export function CreateTenantForm({
  onCreated,
  onCancel,
}: {
  onCreated: (result: PlatformTenantCreated) => void;
  onCancel: () => void;
}): ReactElement {
  const t = useTranslations("app.platform.tenants");
  const tc = useTranslations("app.platform.tenants.create");
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateTenantMutation();
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // Until the user edits the address themselves it follows the name.
  const [slugTouched, setSlugTouched] = useState(false);
  const [level, setLevel] = useState<(typeof EDUCATION_LEVELS)[number]>("sma");
  const [timezone, setTimezone] = useState<string>("Asia/Makassar");
  const [adminName, setAdminName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  const required = (value: string) => (submitted && !value.trim() ? tc("required") : undefined);
  const slugError =
    required(slug) ??
    (slug.trim() && !SLUG_PATTERN.test(slug.trim()) ? tc("slugFormat") : undefined);
  const usernameError =
    required(adminUsername) ??
    (submitted && adminUsername.trim().length < 3 ? tc("usernameLength") : undefined);

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        setError("");
        if (
          !name.trim() ||
          !SLUG_PATTERN.test(slug.trim()) ||
          !adminName.trim() ||
          adminUsername.trim().length < 3
        ) {
          return;
        }
        create.mutate(
          {
            slug: slug.trim(),
            name: name.trim(),
            education_level: level,
            timezone,
            admin_username: adminUsername.trim(),
            admin_email: adminEmail.trim() || undefined,
            admin_name: adminName.trim(),
          },
          {
            onSuccess: (result) => {
              onCreated(result);
            },
            onError: (err) => {
              setError(
                err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
              );
            },
          },
        );
      }}
    >
      {error && <FormError>{error}</FormError>}
      <FormSection title={tc("schoolSectionTitle")}>
        <Field label={tc("name")} required error={required(name)} className="col-span-full">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(tenantSlugFrom(e.target.value));
            }}
            maxLength={150}
          />
        </Field>
        <Field
          label={tc("slug")}
          required
          hint={tc("slugHint")}
          error={slugError}
          className="col-span-full"
        >
          <Input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            maxLength={64}
            autoCapitalize="none"
            spellCheck={false}
            inputClassName="font-mono"
            className="font-mono"
          />
        </Field>
        <Field label={tc("level")}>
          <Select
            options={EDUCATION_LEVELS.map((value) => ({ value, label: t(`level.${value}`) }))}
            value={level}
            onValueChange={(value) => {
              setLevel(value as (typeof EDUCATION_LEVELS)[number]);
            }}
          />
        </Field>
        <Field label={tc("timezone")}>
          <Select
            options={SCHOOL_TIME_ZONES.map((value) => ({
              value,
              label: tc(`timezones.${value.replace("/", "_")}`),
            }))}
            value={timezone}
            onValueChange={setTimezone}
          />
        </Field>
      </FormSection>

      <FormSection title={tc("adminSectionTitle")} description={tc("adminSectionHint")}>
        <Field
          label={tc("adminName")}
          required
          error={required(adminName)}
          className="col-span-full"
        >
          <Input
            value={adminName}
            onChange={(e) => {
              setAdminName(e.target.value);
            }}
            maxLength={150}
          />
        </Field>
        <Field label={tc("adminUsername")} required error={usernameError}>
          <Input
            value={adminUsername}
            onChange={(e) => {
              setAdminUsername(e.target.value);
            }}
            maxLength={80}
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
        <Field label={tc("adminEmail")} optional>
          <Input
            type="email"
            value={adminEmail}
            onChange={(e) => {
              setAdminEmail(e.target.value);
            }}
          />
        </Field>
      </FormSection>

      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>
          {tc("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending}>
          {tc("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
