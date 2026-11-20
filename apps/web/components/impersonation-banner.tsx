"use client";

import { ApiError } from "@newsekolah/api-client";
import { Badge, Button, useToast } from "@newsekolah/ui";
import { UserRoundCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useStopImpersonationMutation } from "../features/auth/api";
import {
  useRoleTestingQuery,
  useRoleTestingSwitchMutation,
} from "../features/auth/role-testing-api";
import { draftOwnerOf } from "../lib/drafts/draft-owner";
import { useApiErrorMessage } from "../lib/i18n/api-error-message";
import { confirmUnsavedChangesBeforeNavigation } from "../lib/navigation/use-unsaved-changes-protection";
import { isAuthRedirecting } from "../lib/session/auth-redirect-flag";
import { ServerAccessCookieError } from "../lib/session/clear-server-access-cookie";
import { useEndSession } from "../lib/session/end-session";
import {
  forgetAccountOnThisBrowser,
  forgetImpersonationOnThisBrowser,
} from "../lib/session/forget-account";
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
 * Stopping an impersonation returns the admin to their own dashboard when
 * the server restored the admin's session (an impersonation started from
 * this browser parks it), and goes to the sign-in page when the server
 * ended it with nothing to restore, or answered that it was already over
 * (its fixed end came, another tab stopped it):
 * useStopImpersonationMutation treats those the same, with no error to
 * show. A stop that failed otherwise (no answer, a
 * server error, too many requests) leaves everything as it was, since the
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
    if (!(await confirmUnsavedChangesBeforeNavigation())) return;
    try {
      await roleSwitch.mutateAsync(null);
      router.replace("/dashboard");
    } catch (error) {
      toast.error(
        tRole(error instanceof ServerAccessCookieError ? "prepareFailed" : "returnFailed"),
      );
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
    // Whose drafts this impersonation wrote, read before the stop swaps the
    // session back to the admin.
    const impersonatedOwner = draftOwnerOf(me);
    // What this browser forgets follows what the stop turned out to be. A
    // stop the server answered with the admin's own session is not a
    // sign-out: only the impersonated session's drafts and account caches
    // go, and the admin's own drafts stay. A stop that leaves nobody signed
    // in (nothing to restore, or the impersonation was already over) is an
    // explicit sign-out like the account menu's, so everything goes. A stop
    // that merely fails keeps the token, the cached data, the drafts and
    // this strip, since the impersonation is still going on, so it can be
    // pressed again.
    stop.mutateAsync().then(
      (outcome) => {
        if (outcome === "restored") {
          forgetImpersonationOnThisBrowser(impersonatedOwner);
          router.replace("/dashboard");
        } else {
          forgetAccountOnThisBrowser();
          router.replace("/login");
        }
      },
      (error: unknown) => {
        // Another request found the session gone meanwhile, and the app is
        // already on its way to the sign-in page (app/providers.tsx,
        // handleUnauthorized).
        if (isAuthRedirecting()) return;
        toast.error(
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
        );
      },
    );
  }

  const adminName = me.impersonated_by.name ?? "admin";
  // The account still has to set its own password; the admin is not sent to
  // that step (needsForcedPasswordChange), so the strip says it is pending.
  // The strip's detail is hidden on a phone and is the first part the
  // ellipsis cuts, so the note is a badge beside the Stop button, visible at
  // every width, and leads the detail (and its tooltip) in full.
  const pendingPassword = me.must_change_password;
  const detail = [
    pendingPassword ? t("pendingPassword") : null,
    t("banner", { name: me.name, adminName }),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <ShellStrip
      icon={<UserRoundCog />}
      title={tStrip("impersonation", { adminName, name: me.name })}
      detail={detail}
      action={
        <>
          {pendingPassword && (
            <Badge tone="danger" size="sm" title={t("pendingPassword")}>
              {tStrip("impersonationPendingPassword")}
            </Badge>
          )}
          <Button size="sm" variant="secondary" loading={stop.isPending} onClick={handleStop}>
            {tStrip("impersonationStop")}
          </Button>
        </>
      }
    />
  );
}
