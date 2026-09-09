import { IntlMessageFormat } from "intl-messageformat";

import en from "../messages/en.json" with { type: "json" };
import id from "../messages/id.json" with { type: "json" };

import { flattenMessages } from "./flatten.js";
import type { MessageKey } from "./message-keys.gen.js";

export type Locale = "id" | "en";
export const DEFAULT_LOCALE: Locale = "id";
export const SUPPORTED_LOCALES: readonly Locale[] = ["id", "en"];

export type MessageValues = Record<string, string | number | Date>;

const catalogs: Record<Locale, Record<string, string>> = {
  id: flattenMessages(id),
  en: flattenMessages(en),
};

const compiledCache = new Map<string, IntlMessageFormat>();

function compile(locale: Locale, key: string, pattern: string): IntlMessageFormat {
  const cacheKey = `${locale}:${key}`;
  const cached = compiledCache.get(cacheKey);
  if (cached) return cached;
  const formatter = new IntlMessageFormat(pattern, locale);
  compiledCache.set(cacheKey, formatter);
  return formatter;
}

/**
 * Resolves a message key for a locale, falling back to the default locale
 * (id) when missing, and finally to the raw key so a broken translation
 * fails loudly in the UI instead of throwing.
 */
export function translate(locale: Locale, key: MessageKey, values?: MessageValues): string {
  const pattern = catalogs[locale][key] ?? catalogs[DEFAULT_LOCALE][key];
  if (pattern === undefined) {
    return key;
  }
  const formatted = compile(locale, key, pattern).format(values);
  return Array.isArray(formatted) ? formatted.join("") : String(formatted);
}

/** Binds a locale so callers can write `t(key, values)` without repeating it. */
export function createTranslator(locale: Locale) {
  return (key: MessageKey, values?: MessageValues) => translate(locale, key, values);
}

export type Translator = ReturnType<typeof createTranslator>;
