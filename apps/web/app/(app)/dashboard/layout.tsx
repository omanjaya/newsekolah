import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { getMessagesForNamespaces } from "../../../lib/i18n/get-messages";
import { APP_NAMESPACES } from "../../../lib/i18n/namespace-sets";
import { getTenantBrandingServer } from "../../../lib/tenant/get-branding.server";

/** This workspace embeds library views; the full catalog stays scoped to these routes. */
export default async function Layout({ children }: { children: ReactNode }): Promise<ReactElement> {
  const branding = await getTenantBrandingServer();
  const locale = branding?.locale ?? "id";
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={getMessagesForNamespaces(locale, [...APP_NAMESPACES, "app.library"])}
    >
      {children}
    </NextIntlClientProvider>
  );
}
