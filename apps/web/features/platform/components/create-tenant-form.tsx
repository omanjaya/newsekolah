"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type PlatformTenantCreated, useCreateTenantMutation } from "../api";

const LEVELS = ["sd", "smp", "sma", "smk"] as const;

export function CreateTenantForm({
  onCreated,
  onCancel,
}: {
  onCreated: (result: PlatformTenantCreated) => void;
  onCancel: () => void;
}): ReactElement {
  const t = useTranslations("app.platform.tenants.create");
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateTenantMutation();
  const [error, setError] = useState("");

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("sma");
  const [timezone, setTimezone] = useState("Asia/Makassar");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        create.mutate(
          {
            slug: slug.trim(),
            name: name.trim(),
            education_level: level,
            timezone: timezone.trim(),
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
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("name")}</span>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          required
          maxLength={150}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("slug")}</span>
        <Input
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
          }}
          required
          maxLength={64}
        />
        <span className="text-[12px] text-fg-muted">{t("slugHint")}</span>
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("level")}</span>
        <Select
          options={LEVELS.map((l) => ({ value: l, label: l.toUpperCase() }))}
          value={level}
          onValueChange={(v) => {
            setLevel(v as (typeof LEVELS)[number]);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("timezone")}</span>
        <Input
          value={timezone}
          onChange={(e) => {
            setTimezone(e.target.value);
          }}
          required
        />
      </label>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <span className="text-[13px] font-medium">{t("adminSectionTitle")}</span>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("adminName")}</span>
          <Input
            value={adminName}
            onChange={(e) => {
              setAdminName(e.target.value);
            }}
            required
            maxLength={150}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("adminUsername")}</span>
          <Input
            value={adminUsername}
            onChange={(e) => {
              setAdminUsername(e.target.value);
            }}
            required
            minLength={3}
            maxLength={80}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("adminEmail")}</span>
          <Input
            type="email"
            value={adminEmail}
            onChange={(e) => {
              setAdminEmail(e.target.value);
            }}
          />
        </label>
      </div>

      {error && <p className="text-[13px] text-status-absent">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
