"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useEffect, useRef } from "react";

import {
  clearUserLocaleCookie,
  parseUserLocale,
  readUserLocaleCookie,
  resolveLocale,
  writeUserLocaleCookie,
} from "../i18n/user-locale-cookie";

import { useSession } from "./session-provider";

/**
 * Applies the signed-in user's language preference (`Me.locale`). The
 * server renders before it knows the user, so the preference travels in the
 * `user_locale` cookie (lib/i18n/user-locale-cookie.ts): once `/v1/me`
 * loads, this writes the preference into the cookie, or removes the cookie
 * when the user has none (the school's language applies), and, when the
 * page is in another language than that, re-renders it from the server. A
 * profile save updates `me`, so a new choice applies the same way. Renders
 * nothing; mounted once inside `SessionProvider`.
 */
export function UserLocaleSync(): null {
  const { me } = useSession();
  const uiLocale = useLocale();
  const router = useRouter();
  const signedIn = me !== undefined;
  const preferred = parseUserLocale(me?.locale);
  const target = resolveLocale(me?.locale, me?.tenant.locale);
  // One server re-render per preference: never a loop, even if the browser
  // refuses the cookie and the server keeps answering in another language.
  const refreshedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    if (preferred) {
      if (readUserLocaleCookie() !== preferred) writeUserLocaleCookie(preferred);
    } else if (readUserLocaleCookie() !== undefined) {
      clearUserLocaleCookie();
    }
    const key = `${preferred ?? "school"}:${target}`;
    if (uiLocale === target || refreshedFor.current === key) return;
    if (readUserLocaleCookie() !== preferred) return;
    refreshedFor.current = key;
    router.refresh();
  }, [signedIn, preferred, target, uiLocale, router]);

  return null;
}
