"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { loginSchema, type LoginInput } from "@newsekolah/schemas";
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
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useForm } from "react-hook-form";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { translateFormMessage } from "../../../lib/i18n/translate-message";
import { useLoginMutation } from "../api";

/** A safe post-login redirect target: same-origin path only, never an external URL from the query string. */
function safeNextPath(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function LoginForm(): ReactElement {
  const t = useTranslations("auth.login");
  const tLogin = useTranslations("app.login");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const searchParams = useSearchParams();
  const loginMutation = useLoginMutation();
  const apiErrorMessage = useApiErrorMessage();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "", client: "web" },
  });

  async function onSubmit(values: LoginInput) {
    form.clearErrors("root");
    try {
      await loginMutation.mutateAsync(values);
      router.replace(safeNextPath(searchParams.get("next")));
    } catch (error) {
      const message =
        error instanceof ApiError ? apiErrorMessage(error.code) : tLogin("genericError");
      form.setError("root", { message });
    }
  }

  return (
    <Form
      form={form}
      translate={translateFormMessage(locale)}
      onSubmit={onSubmit}
      className="flex flex-col gap-4"
    >
      {form.formState.errors.root?.message && (
        <Alert variant="warning" title={form.formState.errors.root.message} />
      )}
      <FormField
        control={form.control}
        name="username"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("usernameLabel")}</FormLabel>
            <FormControl>
              <Input
                autoComplete="username"
                placeholder={tLogin("usernamePlaceholder")}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("passwordLabel")}</FormLabel>
            <FormControl>
              <Input
                type="password"
                autoComplete="current-password"
                placeholder={tLogin("passwordPlaceholder")}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <Button type="submit" loading={loginMutation.isPending} className="mt-2">
        {loginMutation.isPending ? t("submitting") : t("submit")}
      </Button>
    </Form>
  );
}
