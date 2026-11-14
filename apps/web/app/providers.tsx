"use client";

import { Toaster, UiLinkProvider } from "@newsekolah/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import type { ReactElement, ReactNode } from "react";

import { UiLocaleProvider } from "../components/ui-locale-provider";
import { ApiClientProvider } from "../lib/api/client";
import { syncCurrentLocale } from "../lib/i18n/current-locale";
import { QueryProvider } from "../lib/query/query-provider";
import { isExcludedPath } from "../lib/session/access-cookie";
import { markAuthRedirect } from "../lib/session/auth-redirect-flag";
import { SessionProvider } from "../lib/session/session-provider";
import { SimulationSync } from "../lib/simulation/simulation-sync";
import { TenantProvider, type TenantBranding } from "../lib/tenant/tenant-provider";
import { ThemeProvider } from "../lib/theme/theme-provider";

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
  const handleUnauthorized = useCallback(() => {
    const current = pathnameRef.current;
    // Public pages (OPAC, certificate verification, password reset) work
    // without a session, so a failed boot refresh leaves them where they are.
    if (isExcludedPath(current)) return;
    // Marked before the mutations in flight at the moment the session died
    // reject and hit the mutation cache's default error toast (see
    // auth-redirect-flag.ts) -- must happen before router.replace, not after.
    markAuthRedirect();
    router.replace(`/login?next=${encodeURIComponent(current)}`);
  }, [router]);

  return (
    <QueryProvider>
      <ApiClientProvider locale={locale} onUnauthorized={handleUnauthorized}>
        <TenantProvider initialBranding={initialBranding}>
          <SessionProvider>
            <SimulationSync />
            <ThemeProvider>
              {/*
                Every internal link a shared component renders (breadcrumbs,
                TextLink, ListRow, Stat, HeroCard, PageHeader actions) goes
                through next/link, so it navigates on the client instead of
                reloading the app (audit shell-auth-public-42).
              */}
              <UiLinkProvider component={Link}>
                <UiLocaleProvider>
                  {children}
                  {/*
                    Kept global (rather than scoped to `(app)`, docs/16-audit-performa-web.md
                    item 8) because `(auth)/change-password` and `(auth)/reset-password`
                    also call `useToast()` and need a mounted `<Toaster />` to render it.
                    Inside UiLocaleProvider so its close button and region are translated.
                  */}
                  <Toaster />
                </UiLocaleProvider>
              </UiLinkProvider>
            </ThemeProvider>
          </SessionProvider>
        </TenantProvider>
      </ApiClientProvider>
    </QueryProvider>
  );
}
