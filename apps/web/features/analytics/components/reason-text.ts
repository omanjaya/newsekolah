import { useTranslations } from "next-intl";

import type { RiskReason } from "../api";

/**
 * Turns one RiskReason (a stable code plus the numbers observed) into the
 * factual sentence the detail screen shows, e.g. "Absen 7 dari 20 hari
 * sekolah terakhir". Every reasons.* message in analytics.id.json takes
 * exactly the params the matching backend code produces
 * (apps/api/internal/modules/analytics/domain/analytics.go Score); an
 * unrecognized code falls back to a generic line rather than throwing, so
 * a server ahead of the web build still renders something readable.
 */
export function useReasonText(): (reason: RiskReason) => string {
  const t = useTranslations("app.analytics.detail.reasons");
  return (reason) => {
    if (!t.has(reason.code)) return t("unknown");
    return t(reason.code, formatParams(reason.params));
  };
}

/** Rounds a fractional param (a report-score average) to one decimal so
 * the sentence reads "72.5", not a long float; integer params (day and
 * point counts) pass through unchanged. */
function formatParams(params: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] =
      typeof value === "number" && !Number.isInteger(value)
        ? value.toFixed(1)
        : (value as string | number);
  }
  return out;
}
