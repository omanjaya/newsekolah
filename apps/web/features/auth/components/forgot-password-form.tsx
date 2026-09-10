"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@newsekolah/schemas";
import {
  Alert,
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from "@newsekolah/ui";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { translateFormMessage } from "../../../lib/i18n/translate-message";
import { useRequestPasswordResetMutation } from "../api";

/**
 * The API always answers 202 whether or not the address exists (see
 * useRequestPasswordResetMutation), so this form shows the same success
 * state on every accepted submission and never tries to distinguish a
 * known account from an unknown one.
 */
export function ForgotPasswordForm(): ReactElement {
  const t = useTranslations("app.account.forgotPassword");
  const locale = useLocale() as Locale;
  const apiErrorMessage = useApiErrorMessage();
  const mutation = useRequestPasswordResetMutation();
  const [sent, setSent] = useState(false);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { username_or_email: "" },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    form.clearErrors("root");
    try {
      await mutation.mutateAsync(values.username_or_email);
      setSent(true);
    } catch (error) {
      const message =
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN");
      form.setError("root", { message });
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <Alert title={t("successTitle")}>{t("successBody")}</Alert>
        <Link href="/login" className="text-center text-[13px] text-accent hover:underline">
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <Form
      form={form}
      translate={translateFormMessage(locale)}
      onSubmit={onSubmit}
      className="flex flex-col gap-4"
    >
      <p className="text-[13px] text-fg-muted">{t("body")}</p>
      {form.formState.errors.root?.message && (
        <Alert variant="warning" title={form.formState.errors.root.message} />
      )}
      <FormField
        control={form.control}
        name="username_or_email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("usernameOrEmailLabel")}</FormLabel>
            <FormControl>
              <Input autoComplete="username" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <Button type="submit" loading={mutation.isPending} className="mt-2">
        {mutation.isPending ? t("submitting") : t("submit")}
      </Button>
      <Link href="/login" className="text-center text-[13px] text-accent hover:underline">
        {t("backToLogin")}
      </Link>
    </Form>
  );
}
