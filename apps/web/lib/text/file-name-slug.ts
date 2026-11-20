/** Longest slug kept, so a long session or report name still leaves room for a date. */
const MAX_SLUG_LENGTH = 60;

/**
 * Turns a free-text name into a part of a download's file name: lowercase
 * ASCII letters and digits joined by single hyphens ("Opname Semester 1 /
 * 2026" -> "opname-semester-1-2026"). Accents are folded ("Kélas" ->
 * "kelas"); anything else a file system might reject is dropped. Empty when
 * nothing usable is left, so the caller can fall back to a date.
 */
export function fileNameSlug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, "");
}

/** Joins file name parts with hyphens, skipping empty ones. */
export function joinFileNameParts(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join("-");
}
