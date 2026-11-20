import { formatNumber } from "@newsekolah/i18n";

/**
 * The grading scale's own default precision (`round_decimal` in
 * apps/api/internal/modules/grading/domain/grading.go), used where a
 * screen has no scale at hand.
 */
export const DEFAULT_SCORE_DECIMALS = 2;

/**
 * A score in the viewer's locale with the precision the school's scale
 * keeps (`decimals`, the scale's `round_decimal`): "77,55" in id, "77.55"
 * in en, and "88,0" for a whole score (one decimal at least, so a column
 * of scores still reads as scores). Rounding to fewer decimals than the
 * scale showed students and leadership a different number from the one
 * the e-Rapor and report export carry (77.55 read as 77,6).
 */
export function formatScore(
  value: number,
  locale = "id",
  decimals: number = DEFAULT_SCORE_DECIMALS,
): string {
  const max = Math.max(0, Math.trunc(decimals));
  return formatNumber(value, {
    locale: locale === "en" ? "en" : "id",
    minFractionDigits: Math.min(1, max),
    maxFractionDigits: max,
  });
}

/**
 * A stored score written out exactly, with the locale's decimal separator
 * and nothing else: no grouping, rounding or padding ("8,5" and "77,55" in
 * id, "8.5" in en, "88" for a whole score). It is the text an editable
 * score cell starts from, so a saved 8.5 reads back the way the teacher
 * typed it and the way the averages beside it read; formatScore would pad
 * it to "88,0" and make an untouched cell look edited. It also shows a
 * value exactly as an export file carries it, only in the viewer's locale.
 */
export function scoreText(value: number, locale = "id"): string {
  const text = String(value);
  return locale === "en" ? text : text.replace(".", ",");
}
