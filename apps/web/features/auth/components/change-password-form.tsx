"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import {
  changePasswordSchema,
  PASSWORD_MIN_LENGTH,
  toChangePasswordRequest,
  type ChangePasswordInput,
} from "@newsekolah/schemas";
import {
  Alert,
  Button,
  Field,
  Form,
  FormActions,
  FormField,
  PasswordInput,
  useHydrated,
  useToast,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useForm } from "react-hook-form";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { translateFormMessage } from "../../../lib/i18n/translate-message";
import { useChangePasswordMutation } from "../api";

export interface ChangePasswordFormProps {
  onSuccess?: () => void;
  /**
   * `settings` (default): the submit button ends the form on the right, as
   * on the profile page. `auth`: one full-width primary button, as on the
   * other sign-in pages (the forced change after a first sign-in).
   */
  layout?: "settings" | "auth";
}

export function ChangePasswordForm({
  onSuccess,
  layout = "settings",
}: ChangePasswordFormProps): ReactElement {
  const t = useTranslations("auth.changePassword");
  const locale = useLocale() as Locale;
  const mutation = useChangePasswordMutation();
  const apiErrorMessage = useApiErrorMessage();
  const toast = useToast();
  // Defence in depth: today the form renders only on the client, after the
  // session resolves, but a server-rendered copy must not submit natively.
  const hydrated = useHydrated();

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });

  async function onSubmit(values: ChangePasswordInput) {
    form.clearErrors("root");
    try {
      await mutation.mutateAsync(toChangePasswordRequest(values));
      toast.success(t("success"));
      form.reset();
      onSuccess?.();
    } catch (error) {
      const message =
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN");
      form.setError("root", { message });
    }
  }

  const rootError = form.formState.errors.root?.message;
  const submit = (
    <Button
      type="submit"
      size={layout === "auth" ? "lg" : "md"}
      disabled={!hydrated}
      loading={mutation.isPending}
      className={layout === "auth" ? "mt-1 w-full" : undefined}
    >
      {t("submit")}
    </Button>
  );

  return (
    <Form
      form={form}
      translate={translateFormMessage(locale)}
      onSubmit={onSubmit}
      className="flex flex-col gap-5"
    >
      {rootError && <Alert tone="danger" title={rootError} />}
      <FormField
        control={form.control}
        name="current_password"
        render={({ field }) => (
          <Field label={t("currentLabel")}>
            <PasswordInput autoComplete="current-password" {...field} />
          </Field>
        )}
      />
      <FormField
        control={form.control}
        name="new_password"
        render={({ field }) => (
          <Field label={t("newLabel")} hint={t("newHint", { min: PASSWORD_MIN_LENGTH })}>
            <PasswordInput autoComplete="new-password" {...field} />
          </Field>
        )}
      />
      <FormField
        control={form.control}
        name="confirm_password"
        render={({ field }) => (
          <Field label={t("confirmLabel")}>
            <PasswordInput autoComplete="new-password" {...field} />
          </Field>
        )}
      />
      {layout === "auth" ? submit : <FormActions>{submit}</FormActions>}
    </Form>
  );
}
