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

function isDevelopment(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV !== "production";
}

function format(
  locale: Locale,
  key: string,
  pattern: string,
  values: MessageValues | undefined,
): string | undefined {
  try {
    const formatted = compile(locale, key, pattern).format(values);
    return Array.isArray(formatted) ? formatted.join("") : String(formatted);
  } catch (error) {
    if (isDevelopment()) {
      console.warn(`[i18n] could not format "${key}" (${locale})`, error);
    }
    return undefined;
  }
}

/**
 * Resolves a message key for a locale, falling back to the default locale
 * (id) when missing, and finally to the raw key so a broken translation
 * fails loudly in the UI instead of throwing.
 *
 * Formatting never throws either. A pattern that cannot be formatted (most
 * often an ICU variable such as `{min}` the caller did not pass) is retried
 * with the default-locale pattern and then degrades to the key. Messages are
 * formatted during render, so a throw here would replace the whole screen
 * with an error boundary, losing a form the user was filling in.
 */
export function translate(locale: Locale, key: MessageKey, values?: MessageValues): string {
  const localized = catalogs[locale][key];
  const fallback = catalogs[DEFAULT_LOCALE][key];
  const pattern = localized ?? fallback;
  if (pattern === undefined) {
    return key;
  }
  const formatted = format(locale, key, pattern, values);
  if (formatted !== undefined) {
    return formatted;
  }
  if (localized !== undefined && fallback !== undefined && locale !== DEFAULT_LOCALE) {
    return format(DEFAULT_LOCALE, key, fallback, values) ?? key;
  }
  return key;
}

/** Binds a locale so callers can write `t(key, values)` without repeating it. */
export function createTranslator(locale: Locale) {
  return (key: MessageKey, values?: MessageValues) => translate(locale, key, values);
}

export type Translator = ReturnType<typeof createTranslator>;
