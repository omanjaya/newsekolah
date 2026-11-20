"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useEffect, useRef } from "react";

import {
  parseUserLocale,
  readUserLocaleCookie,
  writeUserLocaleCookie,
} from "../i18n/user-locale-cookie";

import { useSession } from "./session-provider";

/**
 * Applies the signed-in user's language preference (`Me.locale`). The
 * server renders before it knows the user, so the preference travels in the
 * `user_locale` cookie (lib/i18n/user-locale-cookie.ts): once `/v1/me`
 * names a preference the cookie does not hold yet, this writes it and, when
 * the page is in another language, re-renders it from the server. A profile
 * save updates `me`, so a new choice applies the same way. Renders nothing;
 * mounted once inside `SessionProvider`.
 */
export function UserLocaleSync(): null {
  const { me } = useSession();
  const uiLocale = useLocale();
  const router = useRouter();
  const preferred = parseUserLocale(me?.locale);
  // One server re-render per preference: never a loop, even if the browser
  // refuses the cookie and the server keeps answering in another language.
  const refreshedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!preferred) return;
    if (readUserLocaleCookie() !== preferred) writeUserLocaleCookie(preferred);
    if (uiLocale === preferred || refreshedFor.current === preferred) return;
    if (readUserLocaleCookie() !== preferred) return;
    refreshedFor.current = preferred;
    router.refresh();
  }, [preferred, uiLocale, router]);

  return null;
}
