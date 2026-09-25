import type { Locale } from "@newsekolah/i18n";

/**
 * The mutation cache's default `onError`/`onSuccess` (lib/query/query-provider.tsx)
 * run outside React -- `QueryCache`/`MutationCache` callbacks are plain
 * functions, not hooks, so they cannot call `useTranslations()`. The root
 * layout already resolves the tenant's locale server-side and hands it to
 * `AppProviders` as a plain prop; `syncCurrentLocale` mirrors that same
 * value into this module so the mutation cache can translate with
 * `@newsekolah/i18n`'s hook-free `translate()` instead.
 */
let currentLocale: Locale = "id";

export function syncCurrentLocale(locale: string): void {
  currentLocale = locale === "en" ? "en" : "id";
}

export function getCurrentLocale(): Locale {
  return currentLocale;
}
