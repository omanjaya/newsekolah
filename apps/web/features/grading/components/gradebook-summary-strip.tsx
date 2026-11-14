"use client";

import { Stat, StatGrid } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { buildGradebookSummary, type GradebookSummaryInput } from "../lib/grading-tiles";

/**
 * The opened sheet's figures as one low strip above the table, so the
 * scores stay the first thing on the screen (a row of tiles pushed them
 * below the fold). Scrolls sideways on a phone.
 */
export function GradebookSummaryStrip(props: Omit<GradebookSummaryInput, "locale">): ReactElement {
  const t = useTranslations("app.grading");
  const locale = useLocale();
  const items = buildGradebookSummary({ ...props, locale });
  return (
    <StatGrid variant="strip" aria-label={t("summary.label")} data-testid="gradebook-summary">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Stat
            key={item.key}
            data-testid={`gradebook-summary-${item.key}`}
            icon={<Icon />}
            tone={item.tone}
            value={item.value}
            label={t(item.labelKey)}
          />
        );
      })}
    </StatGrid>
  );
}
