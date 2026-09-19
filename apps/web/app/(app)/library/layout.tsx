import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { getMessagesForNamespaces } from "../../../lib/i18n/get-messages";
import { LIBRARY_NAMESPACES } from "../../../lib/i18n/namespace-sets";
import { getTenantBrandingServer } from "../../../lib/tenant/get-branding.server";

/**
 * Scopes the `library` message catalog (docs/16-audit-performa-web.md item
 * 11: 35 kB raw, the single biggest feature catalog, "29 kB sendiri" per
 * the audit's gzip measurement) to `/library/*` instead of shipping it to
 * every `(app)` page. `AppShell` (sidebar, header) renders above this
 * layout via `(app)/layout.tsx`, so it keeps resolving `app.shell`/`nav`/…
 * against that provider unaffected by the replacement below — only
 * `children` (the library screens themselves) read from this one.
 *
 * `NextIntlClientProvider` replaces rather than merges `messages` on
 * nesting (see `lib/i18n/namespace-sets.ts`), so `LIBRARY_NAMESPACES` is
 * self-contained: shared `common`/`errors` (library screens use
 * `components/query-error.tsx`) plus the full `library` catalog, not just
 * the delta from `(app)/layout.tsx`.
 */
export default async function LibraryLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  const branding = await getTenantBrandingServer();
  const locale = branding?.locale ?? "id";
  const messages = getMessagesForNamespaces(locale, LIBRARY_NAMESPACES);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
