import { HydrationBoundary } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { getMessagesForNamespaces } from "../../lib/i18n/get-messages";
import { APP_NAMESPACES } from "../../lib/i18n/namespace-sets";
import { dehydrateAppQueryClient } from "../../lib/session/dehydrate-app-query-client.server";
import { getTenantBrandingServer } from "../../lib/tenant/get-branding.server";

import { AppLayoutClient } from "./app-layout-client";

/**
 * Server layout for the `(app)` route group (docs/16-audit-performa-web.md
 * items 1 and 11). Two things need a Server Component here, not the old
 * `"use client"` layout:
 *
 * - `HydrationBoundary` around `AppLayoutClient`, fed by a server-side
 *   prefetch of `/v1/me` (`lib/session/dehydrate-app-query-client.server.ts`)
 *   so `useMe` hydrates instantly instead of the client firing its own
 *   request after hydrate. That prefetch depends on `middleware.ts` having
 *   minted the `sat` access cookie for this navigation; see that file's
 *   doc comment for the full flow and docs/08-security.md section 2.
 * - A nested `NextIntlClientProvider` carrying `APP_NAMESPACES` (everything
 *   `(app)` screens read except the `library` catalog, which gets its own
 *   provider in `library/layout.tsx`) instead of the full ~158 kB raw
 *   catalog the root used to serialize into every page, including `/login`.
 *
 * `getTenantBrandingServer()` is called again here (also called by the
 * root layout) rather than threaded down as a prop: Next.js memoizes
 * identical `fetch` calls within one request, so this costs nothing extra,
 * and it keeps this layout's locale resolution independent of the root's.
 */
export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  // Independent of each other -- run concurrently rather than paying for
  // both round trips in sequence.
  const [branding, dehydratedState] = await Promise.all([
    getTenantBrandingServer(),
    dehydrateAppQueryClient(),
  ]);
  const locale = branding?.locale ?? "id";
  const messages = getMessagesForNamespaces(locale, APP_NAMESPACES);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <HydrationBoundary state={dehydratedState}>
        <AppLayoutClient>{children}</AppLayoutClient>
      </HydrationBoundary>
    </NextIntlClientProvider>
  );
}
