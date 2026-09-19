import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";

import "@newsekolah/ui/styles.css";
import "./globals.css";

import { getMessagesForNamespaces } from "../lib/i18n/get-messages";
import { ROOT_NAMESPACES } from "../lib/i18n/namespace-sets";
import { getTenantBrandingServer } from "../lib/tenant/get-branding.server";
import { PRODUCT_NAME_FALLBACK } from "../lib/tenant/tenant-provider";
import { getThemeBootstrapScript } from "../lib/theme/theme-script";

import { AppProviders } from "./providers";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getTenantBrandingServer();
  const name = branding?.name ?? PRODUCT_NAME_FALLBACK;
  return {
    title: { default: name, template: `%s - ${name}` },
    description: branding?.tagline ?? "Sistem informasi sekolah",
    manifest: "/manifest.webmanifest",
  };
}

export function generateViewport(): Viewport {
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: "#F7F6F3",
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<ReactElement> {
  const branding = await getTenantBrandingServer();
  const locale = branding?.locale ?? "id";
  // Only the namespaces every route needs (docs/16-audit-performa-web.md
  // item 11) — `(app)/layout.tsx` and `(app)/library/layout.tsx` carry the
  // rest, scoped to where they're actually read. See lib/i18n/namespace-sets.ts.
  const messages = getMessagesForNamespaces(locale, ROOT_NAMESPACES);
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Sets data-theme before paint from localStorage, so a forced light/dark
            choice never flashes the system theme first (see lib/theme/theme-script.ts). */}
        {/* React never reflects `nonce` onto the client vnode, so the
            server HTML and the client tree differ on this one attribute.
            Suppressing the warning here is the documented way to keep a
            nonce-carrying inline script under a strict CSP. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: getThemeBootstrapScript() }}
        />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppProviders locale={locale}>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
