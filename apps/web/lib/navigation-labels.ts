import { navigation } from "./navigation";

/**
 * The label key of one navigation registry entry, for an area's own tab
 * strip: the tab then names its page exactly as the menu entry, the page
 * title and the breadcrumb do. Throws on an unknown key, so a renamed
 * entry fails the strip's tests instead of showing a raw key.
 */
export function registryLabelKey(key: string): string {
  const entry = navigation.find((item) => item.key === key);
  if (!entry) throw new Error(`No navigation registry entry "${key}"`);
  return entry.labelKey;
}
