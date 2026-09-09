import type { Locale } from "@newsekolah/i18n";
import enShared from "@newsekolah/i18n/messages/en.json";
import idShared from "@newsekolah/i18n/messages/id.json";

import enApp from "../../messages/en.json";
import idApp from "../../messages/id.json";

const shared: Record<Locale, object> = { id: idShared, en: enShared };
const app: Record<Locale, object> = { id: idApp, en: enApp };

/**
 * Feature catalogs live in their own files under `messages/features/` so two
 * people (or two agents) can add copy for different screens without editing
 * the same JSON. Every file exports one object merged under `app.<feature>`;
 * the file name before the locale suffix is the namespace.
 */
interface FeatureCatalog {
  namespace: string;
  id: Record<string, unknown>;
  en: Record<string, unknown>;
}

const features: FeatureCatalog[] = [];

/** Registers one feature's copy; called from messages/features/index.ts. */
export function registerFeatureMessages(catalog: FeatureCatalog): void {
  features.push(catalog);
}

/**
 * Merges the shared `@newsekolah/i18n` catalog with apps/web's own
 * `messages/*.json` and every registered feature catalog, so
 * `useTranslations()` reads them all through one messages object.
 */
export function getMessages(locale: Locale) {
  const appMessages = app[locale] as { app?: Record<string, unknown> };
  const merged: Record<string, unknown> = { ...shared[locale], ...appMessages };
  const appSection = { ...(appMessages.app ?? {}) } as Record<string, unknown>;
  for (const feature of features) {
    appSection[feature.namespace] = feature[locale];
  }
  merged.app = appSection;
  return merged;
}
