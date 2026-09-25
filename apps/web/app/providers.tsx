"use client";

import { Toaster } from "@newsekolah/ui";
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
import { TenantProvider } from "../lib/tenant/tenant-provider";
import { ThemeProvider } from "../lib/theme/theme-provider";

export function AppProviders({
  locale,
  children,
}: {
  locale: string;
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
        <TenantProvider>
          <SessionProvider>
            <ThemeProvider>
              {/*
                Kept global (rather than scoped to `(app)`, docs/16-audit-performa-web.md
                item 8) because `(auth)/change-password` and `(auth)/reset-password`
                also call `useToast()` and need a mounted `<Toaster />` to render it.
              */}
              <UiLocaleProvider>{children}</UiLocaleProvider>
              <Toaster />
            </ThemeProvider>
          </SessionProvider>
        </TenantProvider>
      </ApiClientProvider>
    </QueryProvider>
  );
}
