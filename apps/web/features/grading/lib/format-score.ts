/**
 * A score with one decimal in the viewer's locale ("88,0" in id, "88.0" in
 * en). `toFixed` always uses a dot, which reads wrong in the Indonesian UI.
 */
export function formatScore(value: number, locale = "id"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}
