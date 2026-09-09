// Tiny i18n helper: flat key -> string lookup, no plural rules or ICU syntax
// because the copy in DESIGN.md is short and direct ("Simpan presensi", not a
// paragraph). Reach for a real i18n library only if that stops being true.

import * as Localization from "expo-localization";
import id from "@/i18n/id.json";
import en from "@/i18n/en.json";

export type Locale = "id" | "en";
export type TranslationKey = keyof typeof id;

const catalogs: Record<Locale, Record<string, string>> = { id, en };

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

/** Looks up `key` in the active catalog, falling back to Indonesian (the
 * product default per DESIGN.md) and finally to the key itself so a missing
 * string is visible instead of crashing the screen. */
export function t(key: TranslationKey): string {
  return catalogs[activeLocale][key] ?? catalogs.id[key] ?? key;
}
