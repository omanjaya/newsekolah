"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import {
  changePasswordSchema,
  toChangePasswordRequest,
  type ChangePasswordInput,
} from "@newsekolah/schemas";
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
  useToast,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useForm } from "react-hook-form";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { translateFormMessage } from "../../../lib/i18n/translate-message";
import { useChangePasswordMutation } from "../api";

export function ChangePasswordForm({ onSuccess }: { onSuccess?: () => void }): ReactElement {
  const t = useTranslations("auth.changePassword");
  const locale = useLocale() as Locale;
  const mutation = useChangePasswordMutation();
  const apiErrorMessage = useApiErrorMessage();
  const toast = useToast();

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

  return (
    <Form
      form={form}
      translate={translateFormMessage(locale)}
      onSubmit={onSubmit}
      className="flex max-w-sm flex-col gap-4"
    >
      {form.formState.errors.root?.message && (
        <Alert variant="warning" title={form.formState.errors.root.message} />
      )}
      <FormField
        control={form.control}
        name="current_password"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("currentLabel")}</FormLabel>
            <FormControl>
              <Input type="password" autoComplete="current-password" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
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
