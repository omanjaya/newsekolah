"use client";

import { Button, PageShell, StatePage } from "@newsekolah/ui";
import { House } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { permissionForPath } from "../lib/navigation-permissions";
import { useDocumentTitle } from "../lib/page-title";
import { useIsSchoolAdmin } from "../lib/session/school-admin";

import { HistoryBackButton } from "./history-back-button";

/** Every platform operator permission carries this prefix (lib/navigation-settings.ts). */
const PLATFORM_PERMISSION_PREFIX = "platform_";

export interface ForbiddenPageProps {
  /** Fills the viewport, for a route without the app shell (a kiosk). */
  fullScreen?: boolean;
  /**
   * Why the reader is refused. `platform`: the page is for platform
   * operators, so no school admin can open it for them. When omitted it is
   * read from the permission the registry gives the current route.
   */
  reason?: "platform";
}

/**
 * The shell, RouteGuard and the kiosk frame render this in place (no
 * navigation) when the reader may not open the page. It is drawn like the
 * in-app 404 (a PageShell with the home button and its house icon), says
 * whom to ask only when there is someone to ask, and names the browser tab
 * after the state, since the page it stands in for never mounts to name it.
 */
export function ForbiddenPage({ fullScreen = false, reason }: ForbiddenPageProps): ReactElement {
  const t = useTranslations("app.forbidden");
  const pathname = usePathname();
  const schoolAdmin = useIsSchoolAdmin();
  useDocumentTitle(t("title"));

  const platform =
    reason === "platform" ||
    (permissionForPath(pathname)?.startsWith(PLATFORM_PERMISSION_PREFIX) ?? false);
  const body = platform ? t("platformBody") : schoolAdmin ? t("bodyAdmin") : t("body");

  const state = (
    <StatePage
      fullScreen={fullScreen}
      kind="forbidden"
      title={t("title")}
      description={body}
      code="403"
      action={
        <Button asChild icon={<House />}>
          <Link href="/dashboard">{t("backHome")}</Link>
        </Button>
      }
      secondaryAction={<HistoryBackButton label={t("back")} />}
    />
  );
  return fullScreen ? state : <PageShell>{state}</PageShell>;
}
