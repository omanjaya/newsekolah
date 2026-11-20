import type { Locale } from "@newsekolah/i18n";

/**
 * The signed-in user's own language preference (`Me.locale`, set on the
 * profile page), mirrored into a cookie so the server render picks it up:
 * the root and route layouts render before any client code can read
 * `/v1/me`. Not a credential and not sensitive (two possible values), so it
 * is a plain, script-readable cookie; `UserLocaleSync` writes it once the
 * session is known, removes it when the user has no preference (so the
 * school's language applies), and an explicit sign-out removes it too.
 */
export const USER_LOCALE_COOKIE = "user_locale";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export function parseUserLocale(value: string | undefined | null): Locale | undefined {
  return value === "id" || value === "en" ? value : undefined;
}

/** The locale a page renders in: the user's preference, else the school's, else Indonesian. */
export function resolveLocale(
  userLocale: string | undefined | null,
  tenantLocale: string | undefined | null,
): Locale {
  return parseUserLocale(userLocale) ?? parseUserLocale(tenantLocale) ?? "id";
}

export function readUserLocaleCookie(): Locale | undefined {
  const entry = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${USER_LOCALE_COOKIE}=`));
  return parseUserLocale(entry?.slice(USER_LOCALE_COOKIE.length + 1));
}

export function writeUserLocaleCookie(locale: Locale): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${USER_LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
}

export function clearUserLocaleCookie(): void {
  document.cookie = `${USER_LOCALE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
