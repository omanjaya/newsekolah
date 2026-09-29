"use client";

import { ApiError } from "@newsekolah/api-client";
import { Alert, Badge, Button, useToast } from "@newsekolah/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useStopImpersonationMutation } from "../features/auth/api";
import {
  useRoleTestingQuery,
  useRoleTestingSwitchMutation,
} from "../features/auth/role-testing-api";
import { setAccessToken } from "../lib/api/access-token";
import { useApiErrorMessage } from "../lib/i18n/api-error-message";
import { confirmUnsavedChangesBeforeNavigation } from "../lib/navigation/use-unsaved-changes-protection";
import { useSession } from "../lib/session/session-provider";
import { clearSimulation } from "../lib/simulation/clock";

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
  const tRole = useTranslations("app.shell.roleTesting");
  const locale = useLocale();
  const toast = useToast();
  const queryClient = useQueryClient();
  const apiErrorMessage = useApiErrorMessage();
  const stop = useStopImpersonationMutation();
  const roleStatus = useRoleTestingQuery({}, Boolean(me?.impersonated_by));
  const roleSwitch = useRoleTestingSwitchMutation();
  const [returnFailed, setReturnFailed] = useState(false);

  if (!me?.impersonated_by) return null;

  const expired = roleStatus.error instanceof ApiError && roleStatus.error.status === 401;
  const selectedSlug = roleStatus.data?.selected_role_slug;
  const selectedRole =
    roleStatus.data?.roles.find((role) => role.slug === selectedSlug)?.name ?? selectedSlug ?? "";
  const expiry = roleStatus.data?.expires_at
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: me.tenant.timezone,
      }).format(new Date(roleStatus.data.expires_at))
    : null;

  async function returnToAdmin() {
    if (!confirmUnsavedChangesBeforeNavigation()) return;
    try {
      await roleSwitch.mutateAsync(null);
      router.replace("/dashboard");
    } catch {
      setReturnFailed(true);
      toast.error(tRole("returnFailed"));
    }
  }

  function signInAgain() {
    setAccessToken(null);
    clearSimulation();
    queryClient.clear();
    router.replace("/login");
  }

  if (expired) {
    return (
      <div className="px-4 pt-4 md:px-6">
        <Alert variant="warning" title={tRole("sessionExpired")}>
          <Button size="sm" variant="secondary" onClick={signInAgain}>
            {tRole("signIn")}
          </Button>
        </Alert>
      </div>
    );
  }

  if (roleStatus.data?.active) {
    return (
      <div className="px-4 pt-4 md:px-6">
        <Alert variant="warning" title={tRole("activeAs", { name: me.name, role: selectedRole })}>
          <div className="flex flex-wrap gap-1">
            {me.roles.map((role) => (
              <Badge key={role.id} variant="accent">
                {role.name}
              </Badge>
            ))}
          </div>
          {expiry && <p>{tRole("expiresAt", { time: expiry })}</p>}
          {returnFailed && <p>{tRole("returnFailed")}</p>}
          <Button
            size="sm"
            variant="secondary"
            loading={roleSwitch.isPending}
            onClick={() => {
              void returnToAdmin();
            }}
            className="mt-2"
          >
            {tRole("return")}
          </Button>
        </Alert>
      </div>
    );
  }

  if (roleStatus.isPending) return null;

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
