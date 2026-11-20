"use client";

import { queryKeys } from "@newsekolah/api-client";
import { Toaster, TooltipProvider, UiLinkProvider } from "@newsekolah/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import type { ReactElement, ReactNode } from "react";

import { UiLocaleProvider } from "../components/ui-locale-provider";
import { UnsavedChangesDialog } from "../components/unsaved-changes-dialog";
import { ApiClientProvider, type ExpiredSession } from "../lib/api/client";
import { syncCurrentLocale } from "../lib/i18n/current-locale";
import { QueryProvider } from "../lib/query/query-provider";
import { isExcludedPath } from "../lib/session/access-cookie";
import { AccountBoundary } from "../lib/session/account-boundary";
import { isAuthRedirecting, markAuthRedirect } from "../lib/session/auth-redirect-flag";
import { endSession } from "../lib/session/end-session";
import { SessionProvider } from "../lib/session/session-provider";
import { signInPath } from "../lib/session/sign-in-path";
import { UserLocaleSync } from "../lib/session/user-locale-sync";
import { SimulationSync } from "../lib/simulation/simulation-sync";
import { TenantProvider, type TenantBranding } from "../lib/tenant/tenant-provider";
import { ThemeProvider } from "../lib/theme/theme-provider";

/** How long a pointer rests on a control before its tooltip opens. */
const TOOLTIP_DELAY_MS = 400;

export function AppProviders({
  locale,
  initialBranding,
  children,
}: {
  locale: string;
  initialBranding?: TenantBranding;
  children: ReactNode;
}): ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  // The mutation cache's default error toast (lib/query/mutation-cache.ts)
  // translates outside React, so it cannot call useTranslations() -- this
  // mirrors the same locale the request config already resolved into a
  // plain module it can read instead.
  useEffect(() => {
    syncCurrentLocale(locale);
  }, [locale]);
  // Stable identity: ApiClientProvider only rebuilds its client when this changes.
  // The boot refresh also fails on the auth pages themselves; redirecting there
  // would remount the login form mid-submit, so only leave protected pages.
  const handleUnauthorized = useCallback(
    ({ client, queryClient }: ExpiredSession) => {
      const current = pathnameRef.current;
      // Public pages (OPAC, certificate verification, password reset) work
      // without a session, so a failed boot refresh leaves them where they are.
      if (isExcludedPath(current)) return;
      // The first expiry already chose where sign-in goes and why. A request
      // that started after it (the removed `me` refetching, a poll) fails the
      // same way before that navigation lands, but no longer finds `me`, so
      // replacing again would drop the session-ended notice. Only clear what
      // it may have put back in the cache.
      if (isAuthRedirecting()) {
        endSession(client, queryClient);
        return;
      }
      // Read before endSession empties the cache: a tab that knew who was
      // signed in lost a session mid-visit, and the sign-in page says so.
      const sessionEnded = queryClient.getQueryData(queryKeys.me()) !== undefined;
      // Marked before the mutations in flight at the moment the session died
      // reject and hit the mutation cache's default error toast (see
      // auth-redirect-flag.ts) -- must happen before router.replace, not after.
      markAuthRedirect({ sessionEnded });
      // The session is over: with its `me` left in the cache the sign-in
      // page would read the tab as signed in and send it straight back.
      endSession(client, queryClient);
      router.replace(signInPath(current, { sessionEnded }));
    },
    [router],
  );

  return (
    <QueryProvider>
      <ApiClientProvider locale={locale} onUnauthorized={handleUnauthorized}>
        <TenantProvider initialBranding={initialBranding}>
          <SessionProvider>
            <SimulationSync />
            <AccountBoundary />
            <UserLocaleSync />
            <ThemeProvider>
              {/*
                Every internal link a shared component renders (breadcrumbs,
                TextLink, ListRow, Stat, HeroCard, PageHeader actions) goes
                through next/link, so it navigates on the client instead of
                reloading the app (audit shell-auth-public-42).
              */}
              <UiLinkProvider component={Link}>
                <UiLocaleProvider>
                  {/*
                    One tooltip provider for the whole app, so the
                    IconButtons on a page share it (and its skip delay:
                    moving from one tooltip to the next shows the next at
                    once) instead of each mounting its own. Same delay as
                    an IconButton's fallback provider.
                  */}
                  <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>{children}</TooltipProvider>
                  {/*
                    Kept global (rather than scoped to `(app)`, docs/16-audit-performa-web.md
                    item 8) because `(auth)/change-password` and `(auth)/reset-password`
                    also call `useToast()` and need a mounted `<Toaster />` to render it.
                    Inside UiLocaleProvider so its close button and region are translated.
                  */}
                  <Toaster />
                  {/*
                    The one question asked before a navigation drops an
                    editor's unsaved changes (useUnsavedChangesProtection).
                  */}
                  <UnsavedChangesDialog />
                </UiLocaleProvider>
              </UiLinkProvider>
            </ThemeProvider>
          </SessionProvider>
        </TenantProvider>
      </ApiClientProvider>
    </QueryProvider>
  );
}
