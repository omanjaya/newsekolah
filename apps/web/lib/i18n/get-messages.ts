import type { Locale } from "@newsekolah/i18n";
import enShared from "@newsekolah/i18n/messages/en.json";
import idShared from "@newsekolah/i18n/messages/id.json";

import enApp from "../../messages/en.json";
import idApp from "../../messages/id.json";

const shared: Record<Locale, object> = { id: idShared, en: enShared };
const app: Record<Locale, object> = { id: idApp, en: enApp };

/**
 * Merges the shared `@newsekolah/i18n` catalog (auth, common, nav, errors,
 * validation) with apps/web's own `messages/*.json` (shell and page copy
 * that has no reason to live in a package shared with the mobile app), so
 * `useTranslations()` can read either one through a single messages object.
 */
export function getMessages(locale: Locale) {
  return { ...shared[locale], ...app[locale] };
}
