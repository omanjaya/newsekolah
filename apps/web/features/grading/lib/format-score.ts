import { formatNumber } from "@newsekolah/i18n";

/**
 * A score with one decimal in the viewer's locale ("88,0" in id, "88.0" in
 * en). `toFixed` always uses a dot, which reads wrong in the Indonesian UI.
 */
export function formatScore(value: number, locale = "id"): string {
  return formatNumber(value, { locale: locale === "en" ? "en" : "id", fractionDigits: 1 });
}
