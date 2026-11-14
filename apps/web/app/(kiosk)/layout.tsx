import { HydrationBoundary } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { getMessagesForNamespaces } from "../../lib/i18n/get-messages";
import { KIOSK_NAMESPACES } from "../../lib/i18n/namespace-sets";
import { dehydrateAppQueryClient } from "../../lib/session/dehydrate-app-query-client.server";
import { getTenantBrandingServer } from "../../lib/tenant/get-branding.server";

import { KioskLayoutClient } from "./kiosk-layout-client";

/**
 * Server layout for the `(kiosk)` route group: the attendance monitor and
 * the two library kiosks, screens left running on a wall or a reading-room
 * desk. Same server work as `(app)/layout.tsx` (the `/v1/me` prefetch, a
 * scoped message catalog), but no app shell: `KioskLayoutClient` gates the
 * session and permissions and draws the kiosk frame instead. The URLs are
 * unchanged; a route group adds no path segment.
 */
export default async function KioskLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  const [branding, dehydratedState] = await Promise.all([
    getTenantBrandingServer(),
    dehydrateAppQueryClient(),
  ]);
  const locale = branding?.locale ?? "id";
  const messages = getMessagesForNamespaces(locale, KIOSK_NAMESPACES);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <HydrationBoundary state={dehydratedState}>
        <KioskLayoutClient>{children}</KioskLayoutClient>
      </HydrationBoundary>
    </NextIntlClientProvider>
  );
}
