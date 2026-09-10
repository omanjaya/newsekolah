"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { resetPasswordSchema, type ResetPasswordInput } from "@newsekolah/schemas";
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
import { useForm } from "react-hook-form";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { translateFormMessage } from "../../../lib/i18n/translate-message";
import { useConfirmPasswordResetMutation } from "../api";

/**
 * Backs both the self-service "forgot password" link and an admin-issued
 * set-password link (features/school/components/users-view.tsx) -- the API
 * accepts either token in the same field, so one form and one screen serve
 * both. `onSuccess` sends the caller back to /login; every session was
 * revoked server-side by the confirm call, so there is nothing left to stay
 * signed into.
 */
export function ResetPasswordForm({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: () => void;
}): ReactElement {
  const t = useTranslations("app.account.resetPassword");
  const locale = useLocale() as Locale;
  const apiErrorMessage = useApiErrorMessage();
  const mutation = useConfirmPasswordResetMutation();

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { new_password: "", confirm_password: "" },
  });

  async function onSubmit(values: ResetPasswordInput) {
    form.clearErrors("root");
    try {
      await mutation.mutateAsync({ token, new_password: values.new_password });
      onSuccess();
    } catch (error) {
      // A PASSWORD_RESET_TOKEN_INVALID error is rendered from `mutation.error`
      // below (it replaces the whole form with a dead-link state), so there
      // is nothing more to do with it here beyond letting it settle.
      if (error instanceof ApiError && error.code === "PASSWORD_RESET_TOKEN_INVALID") {
        return;
      }
      const message =
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN");
      form.setError("root", { message });
    }
  }

  if (
    mutation.isError &&
    mutation.error instanceof ApiError &&
    mutation.error.code === "PASSWORD_RESET_TOKEN_INVALID"
  ) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="warning" title={t("invalidTitle")}>
          {t("invalidBody")}
        </Alert>
        <Link
          href="/forgot-password"
          className="text-center text-[13px] text-accent hover:underline"
        >
          {t("requestNew")}
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
        name="new_password"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("newLabel")}</FormLabel>
            <FormControl>
              <Input type="password" autoComplete="new-password" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="confirm_password"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("confirmLabel")}</FormLabel>
            <FormControl>
              <Input type="password" autoComplete="new-password" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <Button type="submit" loading={mutation.isPending} className="mt-2">
        {t("submit")}
      </Button>
    </Form>
  );
}
