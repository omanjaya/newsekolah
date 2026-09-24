"use client";

import { cn } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { RiskReason } from "../api";

const AT_RISK_SUFFIX = "_at_risk";

export interface RiskReasonsChartProps {
  reasons: RiskReason[];
  reasonText: (reason: RiskReason) => string;
  severityLabel: (atRisk: boolean) => string;
}

/**
 * Each triggered reason's contribution to the score: a bar per reason,
 * length proportional to `Reason.Weight` (the exact number
 * domain.Score produced, sorted by weight already), colored and labeled
 * by the severity that produced it -- reusing RiskLevelBadge's own
 * "watch"/"at risk" text and status tokens, so color is never the only
 * way to tell them apart. A single reason renders as plain text: a
 * one-bar bar chart is not a chart (dataviz anti-patterns say so
 * explicitly), the weight number alone already tells the whole story.
 */
export function RiskReasonsChart({
  reasons,
  reasonText,
  severityLabel,
}: RiskReasonsChartProps): ReactElement {
  const t = useTranslations("app.analytics.detail");

  const [onlyReason] = reasons;
  if (reasons.length === 1 && onlyReason) {
    const reason = onlyReason;
    return (
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[13px] text-fg">
        <span>{reasonText(reason)}</span>
        <span className="shrink-0 tabular-nums text-fg-muted">
          {t("reasonWeight", { weight: reason.weight })}
        </span>
      </p>
    );
  }

  const max = Math.max(...reasons.map((reason) => reason.weight), 1);

  return (
    <ul className="flex flex-col gap-3">
      {reasons.map((reason, index) => {
        const atRisk = reason.code.endsWith(AT_RISK_SUFFIX);
        return (
          <li key={`${reason.code}-${index}`} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <span className="text-[13px] text-fg">{reasonText(reason)}</span>
              <span
                className={cn(
                  "shrink-0 text-[11px] font-medium",
                  atRisk ? "text-status-absent" : "text-status-sick",
                )}
              >
                {severityLabel(atRisk)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 flex-1 overflow-hidden rounded-xs bg-bg">
                <div
                  className={cn(
                    "h-full rounded-xs",
                    atRisk ? "bg-status-absent" : "bg-status-sick",
                  )}
                  style={{ width: `${(reason.weight / max) * 100}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-fg-muted">
                {t("reasonWeight", { weight: reason.weight })}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
