import "server-only";

import type { Locale } from "@newsekolah/i18n";
import { cookies } from "next/headers";

import { USER_LOCALE_COOKIE, resolveLocale } from "./user-locale-cookie";

/**
 * The locale a server render uses: the signed-in user's preference (the
 * `user_locale` cookie `UserLocaleSync` mirrors from `Me.locale`), else the
 * school's own language from its branding, else Indonesian. Every layout
 * that sets up next-intl calls this, so the html `lang`, the client
 * provider and server components never disagree.
 */
export async function getRequestLocale(tenantLocale: string | undefined): Promise<Locale> {
  const store = await cookies();
  return resolveLocale(store.get(USER_LOCALE_COOKIE)?.value, tenantLocale);
}
