"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, DialogFooter, Field, FormError, Input, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCreateRoleMutation } from "../api";

const SLUG_PATTERN = /^[a-z0-9_]+$/;

/** The body of the "Tambah peran" dialog; its actions sit in the dialog's footer. */
export function CreateRoleForm({ onDone }: { onDone: () => void }): ReactElement {
  const t = useTranslations("app.roles");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateRoleMutation();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // Until the user edits the code themselves it follows the name.
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameError = submitted && !name.trim() ? t("nameRequired") : undefined;
  const slugError =
    submitted && !slug.trim()
      ? t("slugRequired")
      : slug.trim() && !SLUG_PATTERN.test(slug.trim())
        ? t("slugFormat")
        : undefined;

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        setError(null);
        if (!name.trim() || !slug.trim() || !SLUG_PATTERN.test(slug.trim())) return;
        create.mutate(
          {
            name: name.trim(),
            slug: slug.trim(),
            ...(description.trim() ? { description: description.trim() } : {}),
          },
          {
            onSuccess: () => {
              toast.success(t("created"));
              onDone();
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
      <Field label={t("name")} required error={nameError}>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugFromName(e.target.value));
          }}
          maxLength={100}
        />
      </Field>
      <Field label={t("slug")} required hint={t("slugHint")} error={slugError}>
        <Input
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          maxLength={60}
          className="font-mono"
        />
      </Field>
      <Field label={t("description")} optional>
        <Input
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          maxLength={200}
        />
      </Field>
      <DialogFooter>
        <Button variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending}>
          {t("create")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Lowercase, underscore-separated code derived from a role name, e.g. "Wali Asrama" -> "wali_asrama". */
export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
