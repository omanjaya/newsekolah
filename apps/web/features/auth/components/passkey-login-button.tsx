"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button } from "@newsekolah/ui";
import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { usePasskeySupported } from "../../../lib/webauthn";
import { usePasskeyLoginMutation } from "../api";

/**
 * Offers passkey sign-in for whatever username is already typed into the
 * login form. Hidden entirely on a browser without WebAuthn support
 * rather than shown disabled, since there is nothing the user could do
 * about it from here.
 */
export function PasskeyLoginButton({
  username,
  onSuccess,
  onError,
  onUsernameRequired,
}: {
  username: string;
  onSuccess: () => void;
  onError: (message: string) => void;
  onUsernameRequired: () => void;
}): ReactElement | null {
  const t = useTranslations("auth.login");
  const apiErrorMessage = useApiErrorMessage();
  const passkeyLogin = usePasskeyLoginMutation();
  const passkeySupported = usePasskeySupported();

  if (!passkeySupported) {
    return null;
  }

  async function handleClick() {
    if (!username.trim()) {
      onUsernameRequired();
      return;
    }
    try {
      await passkeyLogin.mutateAsync(username.trim());
      onSuccess();
    } catch (error) {
      onError(error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      icon={<KeyRound />}
      loading={passkeyLogin.isPending}
      onClick={() => void handleClick()}
    >
      {t("passkeyButton")}
    </Button>
  );
}
