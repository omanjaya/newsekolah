"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, useToast } from "@newsekolah/ui";
import { UserRoundCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useStopImpersonationMutation } from "../features/auth/api";
import {
  useRoleTestingQuery,
  useRoleTestingSwitchMutation,
} from "../features/auth/role-testing-api";
import { useApiErrorMessage } from "../lib/i18n/api-error-message";
import { confirmUnsavedChangesBeforeNavigation } from "../lib/navigation/use-unsaved-changes-protection";
import { isAuthRedirecting } from "../lib/session/auth-redirect-flag";
import { useEndSession } from "../lib/session/end-session";
import { useSession } from "../lib/session/session-provider";

import { ShellStrip } from "./shell-strip";

/**
 * Renders nothing outside an impersonation session (docs/08-security.md
 * section 2: "ditandai di UI"). Un-dismissible -- it is the one signal an
 * administrator has that they are not looking at their own account -- but
 * quiet: one line in the header's sticky stack, so it stays in view on a
 * long page without pushing the screen around, with one way back out.
 * Testing as another account shows who and as which role; the header's
 * role switcher carries the controls on a desktop, and the strip offers
 * the way back on a phone, where the header has no room for them.
 *
 * Stopping an impersonation goes to the sign-in page once the server has
 * ended it. A stop that failed leaves everything as it was, since the
 * impersonation is still going on: the strip stays, says what went wrong,
 * and its button can be pressed again.
 */
export function ImpersonationBanner(): ReactElement | null {
  const { me } = useSession();
  const router = useRouter();
  const t = useTranslations("app.shell.impersonation");
  const tRole = useTranslations("app.shell.roleTesting");
  const tStrip = useTranslations("app.shell.strip");
  const locale = useLocale();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const stop = useStopImpersonationMutation();
  const endSession = useEndSession();
  const roleStatus = useRoleTestingQuery({}, Boolean(me?.impersonated_by));
  const roleSwitch = useRoleTestingSwitchMutation();

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
      toast.error(tRole("returnFailed"));
    }
  }

  function signInAgain() {
    endSession();
    router.replace("/login");
  }

  if (expired) {
    return (
      <ShellStrip
        icon={<UserRoundCog />}
        title={tStrip("roleTestingExpired")}
        detail={tRole("sessionExpired")}
        action={
          <Button size="sm" variant="secondary" onClick={signInAgain}>
            {tRole("signIn")}
          </Button>
        }
      />
    );
  }

  if (roleStatus.data?.active) {
    return (
      <ShellStrip
        icon={<UserRoundCog />}
        title={tStrip("roleTesting", { name: me.name })}
        detail={[selectedRole, expiry ? tRole("expiresAt", { time: expiry }) : null]
          .filter(Boolean)
          .join(" · ")}
        action={
          <Button
            size="sm"
            variant="secondary"
            loading={roleSwitch.isPending}
            onClick={() => {
              void returnToAdmin();
            }}
            className="md:hidden"
          >
            {tStrip("roleTestingReturn")}
          </Button>
        }
      />
    );
  }

  if (roleStatus.isPending) return null;

  function handleStop() {
    stop.mutateAsync().then(
      () => {
        router.replace("/login");
      },
      (error: unknown) => {
        // The session ran out meanwhile, and the app is already on its way
        // to the sign-in page (app/providers.tsx, handleUnauthorized).
        if (isAuthRedirecting()) return;
        toast.error(
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
        );
      },
    );
  }

  const adminName = me.impersonated_by.name ?? "admin";
  return (
    <ShellStrip
      icon={<UserRoundCog />}
      title={tStrip("impersonation", { adminName, name: me.name })}
      detail={t("banner", { name: me.name, adminName })}
      action={
        <Button size="sm" variant="secondary" loading={stop.isPending} onClick={handleStop}>
          {tStrip("impersonationStop")}
        </Button>
      }
    />
  );
}
