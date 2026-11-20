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
