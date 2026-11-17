import type { Locale } from "@newsekolah/i18n";

/** "3,25" (id) or "3.25" (en): an average score, always two decimals. */
export function formatScore(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** The mean of an observation's criterion scores, or null when it has none. */
export function averageScore(scores: readonly { score: number }[]): number | null {
  if (scores.length === 0) return null;
  return scores.reduce((sum, item) => sum + item.score, 0) / scores.length;
}
