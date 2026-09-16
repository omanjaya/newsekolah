const MONTH_ROMAN = [
  "",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
] as const;

/** 1-12 as the Roman numeral used in Indonesian letter numbering (bulan romawi). */
export function monthRoman(month: number): string {
  return month >= 1 && month <= 12 ? (MONTH_ROMAN[month] ?? "") : "";
}

/** Sample values a preview substitutes for `{{seq}}`, `{{sp_level_number}}`, `{{month_roman}}`, `{{year}}`. */
export interface WarningLetterPreviewSample {
  seq: number;
  spLevelNumber: number;
  date: Date;
}

export function defaultPreviewSample(): WarningLetterPreviewSample {
  return { seq: 1, spLevelNumber: 1, date: new Date() };
}

/**
 * Renders a numbering pattern the same way the server does
 * (apps/api/internal/modules/permits/service/issue_document.go,
 * apps/api/internal/wiring/discipline.go): `{{seq}}` zero-padded to
 * `seqPad` digits, `{{month_roman}}` and `{{year}}` from the sample date,
 * `{{sp_level_number}}` as a plain integer. An unknown placeholder is left
 * as-is rather than dropped, matching `RenderNumberingTemplate`.
 */
export function previewWarningLetterNumber(
  pattern: string,
  seqPad: number,
  sample: WarningLetterPreviewSample = defaultPreviewSample(),
): string {
  const seq = seqPad > 0 ? String(sample.seq).padStart(seqPad, "0") : String(sample.seq);
  const vars: Record<string, string> = {
    seq,
    sp_level_number: String(sample.spLevelNumber),
    month_roman: monthRoman(sample.date.getMonth() + 1),
    year: String(sample.date.getFullYear()),
  };
  let out = pattern;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}

/** The server rejects a pattern without `{{seq}}`: there would be no way to keep numbers unique. */
export function hasSeqPlaceholder(pattern: string): boolean {
  return pattern.includes("{{seq}}");
}
