/**
 * The browser tab title's shape, "<page> · <school>". Its own module, free
 * of React, so the root layout's server metadata and the client title
 * store (lib/page-title.ts) share one separator.
 */
export const TITLE_SEPARATOR = " · ";

export function composeDocumentTitle(page: string | null | undefined, school: string): string {
  const name = page?.trim();
  if (!name) return school;
  return school ? `${name}${TITLE_SEPARATOR}${school}` : name;
}
