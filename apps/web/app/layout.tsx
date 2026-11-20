import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";

import "@newsekolah/ui/styles.css";
import "./globals.css";

import { ALLOW_INDEXING } from "../lib/env";
import { getMessagesForNamespaces } from "../lib/i18n/get-messages";
import { ROOT_NAMESPACES } from "../lib/i18n/namespace-sets";
import { getRequestLocale } from "../lib/i18n/request-locale.server";
import { TITLE_SEPARATOR } from "../lib/page-title-format";
import { REFRESH_TOKEN_COOKIE_NAME } from "../lib/session/access-cookie";
import { getTenantBrandingServer } from "../lib/tenant/get-branding.server";
import { PRODUCT_NAME_FALLBACK } from "../lib/tenant/product-name";
import { THEME_COLOR } from "../lib/theme/theme-color";
import { getThemeBootstrapScript } from "../lib/theme/theme-script";

import { manrope, plusJakartaSans } from "./fonts";
import { AppProviders } from "./providers";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getTenantBrandingServer();
  const name = branding?.name ?? PRODUCT_NAME_FALLBACK;
  return {
    // Same "<page> · <school>" shape the client keeps up to date (lib/page-title.ts).
    title: { default: name, template: `%s${TITLE_SEPARATOR}${name}` },
    description: branding?.tagline ?? "Sistem informasi sekolah",
    manifest: "/manifest.webmanifest",
    // Test period (docs/15-paritas-sion.md): stays out of search engines
    // until NEXT_PUBLIC_ALLOW_INDEXING is explicitly set, matching
    // app/robots.ts's disallow-all default. Kept here too, not just in
    // robots.ts, so a page reached without robots.txt being read first
    // (an indexed link, a crawler that ignores robots.txt) still carries
    // the directive.
    robots: ALLOW_INDEXING ? undefined : { index: false, follow: false, nocache: true },
  };
}

/**
 * `viewportFit: "cover"` lets an installed app reach under the status bar
 * and the home indicator; the shell pads itself clear of both with the
 * safe-area insets (the header's top, the tab bar's bottom, the body's
 * sides). The theme colour is the page colour the phone's header takes in
 * each theme (lib/theme/theme-color.ts pins it when the theme is forced).
 */
export function generateViewport(): Viewport {
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
      { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
    ],
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<ReactElement> {
  const branding = await getTenantBrandingServer();
  const locale = await getRequestLocale(branding?.locale);
  // Only the namespaces every route needs (docs/16-audit-performa-web.md
  // item 11) — `(app)/layout.tsx` and `(app)/library/layout.tsx` carry the
  // rest, scoped to where they're actually read. See lib/i18n/namespace-sets.ts.
  const messages = getMessagesForNamespaces(locale, ROOT_NAMESPACES);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // Only whether it is there: an anonymous visit to a public page then
  // skips the session round trip (lib/session/access-cookie.ts).
  const sessionCookieSeen = (await cookies()).has(REFRESH_TOKEN_COOKIE_NAME);

  return (
    <html
      lang={locale}
      className={`${manrope.variable} ${plusJakartaSans.variable}`}
      suppressHydrationWarning
    >
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
          <AppProviders
            locale={locale}
            initialBranding={branding}
            sessionCookieSeen={sessionCookieSeen}
          >
            {children}
          </AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
