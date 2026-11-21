import type { Locale } from "@newsekolah/i18n";
import { useLocale, useTranslations } from "next-intl";

import { formatScore } from "../../grading/lib/format-score";
import type { RiskReason } from "../api";

/**
 * Turns one RiskReason (a stable code plus the numbers observed) into the
 * factual sentence the detail screen shows, e.g. "Absen 7 dari 20 hari
 * sekolah terakhir". Every reasons.* message in analytics.id.json takes
 * exactly the params the matching backend code produces
 * (apps/api/internal/modules/analytics/domain/analytics.go Score); an
 * unrecognized code falls back to a generic line rather than throwing, so
 * a server ahead of the web build still renders something readable.
 *
 * `decimals` is the grading scale's round_decimal
 * (RiskSignals.score_decimals): a report-score average reads at the
 * precision the gradebook shows it at.
 */
export function useReasonText(decimals?: number): (reason: RiskReason) => string {
  const t = useTranslations("app.analytics.detail.reasons");
  const locale = useLocale() as Locale;
  return (reason) => {
    if (!t.has(reason.code)) return t("unknown");
    return t(reason.code, formatParams(reason.params, locale, decimals));
  };
}

/** The params that are report-score averages (the grade-drop reasons). */
const SCORE_PARAMS = new Set(["previous_average", "current_average"]);

/** Writes a report-score average at the scale's precision in the reader's
 * locale, so the sentence reads "72,46" (id) or "72.46" (en), not a long
 * float; the other params (day and point counts) pass through unchanged. */
function formatParams(
  params: Record<string, unknown>,
  locale: Locale,
  decimals: number | undefined,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] =
      typeof value === "number" && SCORE_PARAMS.has(key)
        ? formatScore(value, locale, decimals)
        : (value as string | number);
  }
  return out;
}
