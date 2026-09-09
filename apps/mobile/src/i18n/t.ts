// Two catalogs, one active locale. Common strings (buttons, validation,
// auth screens, server error codes) live in @newsekolah/i18n's
// messages/*.json so web and mobile show the same copy; screen/flow copy
// that is mobile-only (school picker, server override, tab labels) stays in
// this app's own id.json/en.json rather than growing the shared catalog
// with keys only one client uses.
import * as Localization from "expo-localization";
import {
  translate,
  type Locale as SharedLocale,
  type MessageKey,
  type MessageValues,
} from "@newsekolah/i18n";
import id from "@/i18n/id.json";
import en from "@/i18n/en.json";

export type Locale = SharedLocale;
export type MobileMessageKey = keyof typeof id;

const mobileCatalogs: Record<Locale, Record<string, string>> = { id, en };

function detectDeviceLocale(): Locale {
  const tag = Localization.getLocales()[0]?.languageCode;
  return tag === "en" ? "en" : "id";
}

let activeLocale: Locale = detectDeviceLocale();

export function setLocale(locale: Locale): void {
  activeLocale = locale;
}

export function getLocale(): Locale {
  return activeLocale;
}

/** Looks up `key` in this app's own catalog, falling back to Indonesian (the
 * product default per DESIGN.md) and finally to the key itself so a missing
 * string is visible instead of crashing the screen. */
export function t(key: MobileMessageKey): string {
  return mobileCatalogs[activeLocale][key] ?? mobileCatalogs.id[key] ?? key;
}

/** Looks up `key` in the shared @newsekolah/i18n catalog (common.*,
 * validation.*, auth.*, errors.*, ...) for the active locale. */
export function tShared(key: MessageKey, values?: MessageValues): string {
  return translate(activeLocale, key, values);
}
