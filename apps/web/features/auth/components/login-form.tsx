"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { loginSchema, type LoginInput } from "@newsekolah/schemas";
import {
  Alert,
  Button,
  Field,
  Form,
  FormField,
  Input,
  PasswordInput,
  TextLink,
  useHydrated,
} from "@newsekolah/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { translateFormMessage } from "../../../lib/i18n/translate-message";
import { usePasskeySupported } from "../../../lib/webauthn";
import { useGoogleSSOAvailabilityQuery, useLoginMutation } from "../api";

import { GoogleSignInButton } from "./google-sign-in-button";
import { PasskeyLoginButton } from "./passkey-login-button";

/** A safe post-login redirect target: same-origin path only, never an external URL from the query string. */
function safeNextPath(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

/**
 * Username and password first, with the forgot-password link on the
 * password label's row; the second factor joins the same form when the
 * server asks for it. Google and passkey sign-in follow under an "atau"
 * rule as secondary buttons, so the everyday path stays the obvious one.
 */
export function LoginForm(): ReactElement {
  const t = useTranslations("auth.login");
  const tLogin = useTranslations("app.login");
  const tSecurity = useTranslations("app.security");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const searchParams = useSearchParams();
  const loginMutation = useLoginMutation();
  const apiErrorMessage = useApiErrorMessage();
  const googleSSO = useGoogleSSOAvailabilityQuery();
  const passkeySupported = usePasskeySupported();
  // The form is in the server markup: until React attaches onSubmit, a
  // press would run the browser's own submit. Form posts (never a GET with
  // the password in the URL), and the button waits for hydration besides.
  const hydrated = useHydrated();

  // Set once the API rejects a login attempt with MFA_REQUIRED, so the same
  // username and password can be resubmitted with an added `otp` field
  // (docs/08-security.md section 2: TOTP as a second factor at sign-in).
  const [otpRequired, setOtpRequired] = useState(false);
  const [otp, setOtp] = useState("");
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (otpRequired) otpRef.current?.focus();
  }, [otpRequired]);

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

  const rootError = form.formState.errors.root?.message;
  const showAlternatives = !otpRequired && (googleSSO.data?.enabled === true || passkeySupported);

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
        name="username"
        render={({ field }) => (
          <Field label={t("usernameLabel")}>
            <Input autoComplete="username" autoCapitalize="none" spellCheck={false} {...field} />
          </Field>
        )}
      />
      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <Field
            label={t("passwordLabel")}
            labelAside={
              otpRequired ? undefined : (
                <TextLink href="/forgot-password">{t("forgotPasswordLink")}</TextLink>
              )
            }
          >
            <PasswordInput autoComplete="current-password" {...field} />
          </Field>
        )}
      />
      {otpRequired && (
        <Field label={tSecurity("login.otpLabel")} hint={tSecurity("login.otpBody")}>
          <Input
            id="login-otp"
            ref={otpRef}
            autoComplete="one-time-code"
            inputMode="numeric"
            value={otp}
            onChange={(event) => {
              setOtp(event.target.value);
            }}
          />
        </Field>
      )}
      <Button
        type="submit"
        size="lg"
        disabled={!hydrated}
        loading={loginMutation.isPending}
        className="mt-1 w-full"
      >
        {loginMutation.isPending
          ? t("submitting")
          : otpRequired
            ? tSecurity("login.submit")
            : t("submit")}
      </Button>

      {showAlternatives && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 text-caption text-fg-muted">
            <span className="h-px flex-1 bg-line" aria-hidden="true" />
            {t("orDivider")}
            <span className="h-px flex-1 bg-line" aria-hidden="true" />
          </div>
          <div className="flex flex-col items-stretch gap-2">
            {googleSSO.data?.enabled && googleSSO.data.client_id && (
              <GoogleSignInButton
                clientId={googleSSO.data.client_id}
                locale={locale}
                onSuccess={() => {
                  router.replace(safeNextPath(searchParams.get("next")));
                }}
                onError={(message) => {
                  form.setError("root", { message });
                }}
              />
            )}
            <PasskeyLoginButton
              username={form.watch("username")}
              onSuccess={() => {
                router.replace(safeNextPath(searchParams.get("next")));
              }}
              onError={(message) => {
                form.setError("root", { message });
              }}
              onUsernameRequired={() => {
                form.setError("username", { message: t("passkeyUsernameRequired") });
              }}
            />
          </div>
        </div>
      )}
    </Form>
  );
}
