"use client";

import { Toaster } from "@newsekolah/ui";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import type { ReactElement, ReactNode } from "react";

import { UiLocaleProvider } from "../components/ui-locale-provider";
import { ApiClientProvider } from "../lib/api/client";
import { QueryProvider } from "../lib/query/query-provider";
import { isExcludedPath } from "../lib/session/access-cookie";
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
  // Stable identity: ApiClientProvider only rebuilds its client when this changes.
  // The boot refresh also fails on the auth pages themselves; redirecting there
  // would remount the login form mid-submit, so only leave protected pages.
  const handleUnauthorized = useCallback(() => {
    const current = pathnameRef.current;
    // Public pages (OPAC, certificate verification, password reset) work
    // without a session, so a failed boot refresh leaves them where they are.
    if (isExcludedPath(current)) return;
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
