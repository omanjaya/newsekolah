"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { ForbiddenPage } from "../../components/forbidden-page";
import { KioskShell } from "../../components/kiosk-shell";
import { ModuleUnavailablePage } from "../../components/module-unavailable-page";
import { RouteGuard } from "../../components/route-guard";
import { resolvePageContext } from "../../lib/navigation/page-context";
import { useAppNavigation } from "../../lib/navigation/use-app-navigation";
import { navAccessFromMe } from "../../lib/navigation-access";
import { pathAccess } from "../../lib/navigation-permissions";
import { useDocumentTitle } from "../../lib/page-title";
import { useSession } from "../../lib/session/session-provider";

/**
 * The kiosk screen, once the session is known: the registry's access rule,
 * then the frame. A screen the reader may not open gets the same state
 * pages as the app shell, filling the viewport since there is no shell.
 */
function KioskGate({ children }: { children: ReactNode }): ReactElement {
  const { me } = useSession();
  const pathname = usePathname();

  // The same rule the app shell applies to its pages (lib/navigation-permissions.ts).
  const access = pathAccess(pathname, navAccessFromMe(me));
  if (access === "module-disabled") return <ModuleUnavailablePage fullScreen />;
  if (access !== "ok") return <ForbiddenPage fullScreen />;
  return <KioskFrame>{children}</KioskFrame>;
}

/**
 * The frame around a kiosk screen the reader may open. It names the browser
 * tab after the screen; it stays out of the way of a state page, which
 * names the tab after itself.
 */
function KioskFrame({ children }: { children: ReactNode }): ReactElement {
  const { me } = useSession();
  const pathname = usePathname();
  const t = useTranslations();
  const entries = useAppNavigation();
  const context = resolvePageContext(pathname, entries);
  const pageLabelKey = context.page?.labelKey;
  const title = pageLabelKey && t.has(pageLabelKey) ? t(pageLabelKey) : undefined;
  useDocumentTitle(title);

  // Back to the area the kiosk was opened from (the circulation desk, the
  // duty page), or home when the kiosk is that area's only page.
  const entryHref = context.entry?.href;
  const exitHref = entryHref && entryHref !== pathname ? entryHref : "/dashboard";

  return (
    <KioskShell title={title} exitHref={exitHref} timeZone={me?.tenant.timezone}>
      {children}
    </KioskShell>
  );
}

/**
 * Client half of the `(kiosk)` layout: the same session gate as `(app)`
 * (sign-in redirect, forced password change), without the app shell.
 */
export function KioskLayoutClient({ children }: { children: ReactNode }): ReactElement {
  return (
    <RouteGuard>
      <KioskGate>{children}</KioskGate>
    </RouteGuard>
  );
}
