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

function getByPath(source: unknown, path: readonly string[]): unknown {
  let cursor = source;
  for (const key of path) {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

function setByPath(target: Record<string, unknown>, path: readonly string[], value: unknown): void {
  const [head, ...rest] = path;
  if (head === undefined) return;
  if (rest.length === 0) {
    target[head] = value;
    return;
  }
  const next = target[head];
  const child = typeof next === "object" && next !== null ? (next as Record<string, unknown>) : {};
  target[head] = child;
  setByPath(child, rest, value);
}

/**
 * `getMessages`, narrowed to the given dotted namespace paths (e.g.
 * `"app.library"`, or `"app.library.opac"` for just that nested slice) —
 * see `lib/i18n/namespace-sets.ts` for why the root layout, `(app)/layout.tsx`,
 * and `(app)/library/layout.tsx` each need a different subset
 * (docs/16-audit-performa-web.md item 11). Reuses `getMessages`'s merge
 * instead of duplicating it, so a namespace picked here is always exactly
 * what `getMessages` would have produced for it. A path with no match
 * (typo, or a namespace not yet registered) is silently skipped rather
 * than throwing: a missing string is a visible, fixable bug; a server
 * layout crash on every request is not a trade worth making for it.
 */
export function getMessagesForNamespaces(
  locale: Locale,
  namespaces: readonly string[],
): Record<string, unknown> {
  const full = getMessages(locale);
  const picked: Record<string, unknown> = {};
  for (const namespace of namespaces) {
    const path = namespace.split(".");
    const value = getByPath(full, path);
    if (value !== undefined) {
      setByPath(picked, path, value);
    }
  }
  return picked;
}
