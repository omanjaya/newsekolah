import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * Server metadata naming a page whose title never changes, so its first
 * HTML (a shared link, history, the tab before scripts run) already reads
 * "<page> · <school>" through the root layout's title template. The client
 * keeps the same title with useDocumentTitle (lib/page-title.ts) from the
 * same message, so the two never disagree.
 */
export async function pageTitleMetadata(namespace: string, key: string): Promise<Metadata> {
  const t = await getTranslations(namespace);
  return { title: t(key) };
}
