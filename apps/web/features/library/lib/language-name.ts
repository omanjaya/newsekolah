/**
 * "ind" -> "Indonesia": catalogue records store ISO 639 codes, which read
 * as noise to a librarian or a reader. An unknown or malformed code is
 * shown as stored rather than dropped.
 */
export function languageName(code: string, locale: string): string {
  const trimmed = code.trim();
  if (!trimmed) return "";
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(trimmed) ?? trimmed;
  } catch {
    return trimmed;
  }
}
