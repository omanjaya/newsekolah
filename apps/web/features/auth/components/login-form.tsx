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
import { useState } from "react";
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
  const tSecurity = useTranslations("app.security");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const searchParams = useSearchParams();
  const loginMutation = useLoginMutation();
  const apiErrorMessage = useApiErrorMessage();

  // Set once the API rejects a login attempt with MFA_REQUIRED, so the same
  // username and password can be resubmitted with an added `otp` field
  // (docs/08-security.md section 2: TOTP as a second factor at sign-in).
  const [otpRequired, setOtpRequired] = useState(false);
  const [otp, setOtp] = useState("");

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "", client: "web" },
  });

  async function onSubmit(values: LoginInput) {
    form.clearErrors("root");
    const payload: LoginInput & { otp?: string } = otpRequired ? { ...values, otp } : values;
    try {
      await loginMutation.mutateAsync(payload);
      router.replace(safeNextPath(searchParams.get("next")));
    } catch (error) {
      if (error instanceof ApiError && error.code === "MFA_REQUIRED") {
        setOtpRequired(true);
        return;
      }
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
      {otpRequired && (
        <div className="flex flex-col gap-2">
          <label htmlFor="login-otp" className="text-[13px] font-medium text-fg">
            {tSecurity("login.otpLabel")}
          </label>
          <p className="text-[13px] text-fg-muted">{tSecurity("login.otpBody")}</p>
          <Input
            id="login-otp"
            autoComplete="one-time-code"
            inputMode="numeric"
            value={otp}
            onChange={(event) => {
              setOtp(event.target.value);
            }}
          />
        </div>
      )}
      <Button type="submit" loading={loginMutation.isPending} className="mt-2">
        {loginMutation.isPending
          ? t("submitting")
          : otpRequired
            ? tSecurity("login.submit")
            : t("submit")}
      </Button>
    </Form>
  );
}
