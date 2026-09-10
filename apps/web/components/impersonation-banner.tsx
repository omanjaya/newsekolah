"use client";

import { ApiError } from "@newsekolah/api-client";
import { Alert, Button, useToast } from "@newsekolah/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useStopImpersonationMutation } from "../features/auth/api";
import { useApiErrorMessage } from "../lib/i18n/api-error-message";
import { useSession } from "../lib/session/session-provider";

/**
 * Renders nothing outside an impersonation session (docs/08-security.md
 * section 2: "ditandai di UI"). Deliberately loud and un-dismissible --
 * this is the one signal an administrator has that they are not looking at
 * their own account -- with a single click back out.
 */
export function ImpersonationBanner(): ReactElement | null {
  const { me } = useSession();
  const router = useRouter();
  const t = useTranslations("app.shell.impersonation");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const stop = useStopImpersonationMutation();

  if (!me?.impersonated_by) return null;

  function handleStop() {
    stop.mutateAsync().then(
      () => {
        router.replace("/login");
      },
      (error: unknown) => {
        toast.error(
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
        );
      },
    );
  }

  return (
    <div className="px-4 pt-4 md:px-6">
      <Alert
        variant="warning"
        title={t("banner", { name: me.name, adminName: me.impersonated_by.name ?? "admin" })}
      >
        <Button
          size="sm"
          variant="secondary"
          loading={stop.isPending}
          onClick={handleStop}
          className="mt-2"
        >
          {t("stop")}
        </Button>
      </Alert>
    </div>
  );
}
