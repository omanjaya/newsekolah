"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@newsekolah/schemas";
import { Alert, Button, Field, Form, FormField, Input } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useForm } from "react-hook-form";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { translateFormMessage } from "../../../lib/i18n/translate-message";
import { useRequestPasswordResetMutation } from "../api";

/**
 * The API always answers 202 whether or not the address exists (see
 * useRequestPasswordResetMutation), so every accepted submission calls
 * `onSent` alike and the page shows the same "check your inbox" state; the
 * form never tries to tell a known account from an unknown one.
 */
export function ForgotPasswordForm({ onSent }: { onSent: () => void }): ReactElement {
  const t = useTranslations("app.account.forgotPassword");
  const locale = useLocale() as Locale;
  const apiErrorMessage = useApiErrorMessage();
  const mutation = useRequestPasswordResetMutation();

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { username_or_email: "" },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    form.clearErrors("root");
    try {
      await mutation.mutateAsync(values.username_or_email);
      onSent();
    } catch (error) {
      const message =
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN");
      form.setError("root", { message });
    }
  }

  const rootError = form.formState.errors.root?.message;

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
        name="username_or_email"
        render={({ field }) => (
          <Field label={t("usernameOrEmailLabel")}>
            <Input autoComplete="username" autoCapitalize="none" spellCheck={false} {...field} />
          </Field>
        )}
      />
      <Button type="submit" size="lg" loading={mutation.isPending} className="mt-1 w-full">
        {mutation.isPending ? t("submitting") : t("submit")}
      </Button>
    </Form>
  );
}
