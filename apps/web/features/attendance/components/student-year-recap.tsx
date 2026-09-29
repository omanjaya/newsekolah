"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { SessionDetail } from "../api";
import { yearRecapParts } from "../lib/year-recap";

type AttendanceStatus = SessionDetail["statuses"][number];

/**
 * A student's running exception-status recap for the current academic
 * year, spelled out as text next to their name on the roster (e.g. "Tahun
 * ini: sakit 1, dispensasi 3") instead of the old cryptic dot row ("S1 I0
 * D0 A0") -- a teacher scanning the roster reads this without decoding
 * codes first. Only statuses with a count above zero are named; a clean
 * year gets a neutral phrase instead of a wall of zeroes.
 *
 * Renders nothing when `yearCounts` itself is missing (no recap data has
 * loaded for this student yet) -- that is a data-availability gap, not a
 * clean-slate year, and does not deserve the neutral phrase either.
 */
export function StudentYearRecap({
  statuses,
  yearCounts,
}: {
  statuses: AttendanceStatus[];
  yearCounts?: Record<string, number>;
}): ReactElement | null {
  const t = useTranslations("app.attendance.editor");
  const hasExceptions = statuses.some((s) => !s.counts_as_present);
  if (!hasExceptions || !yearCounts) return null;

  const parts = yearRecapParts(statuses, yearCounts);
  const text =
    parts.length > 0
      ? t("recapSummary", {
          summary: parts
            .map((part) => `${part.label.toLocaleLowerCase()} ${part.count}`)
            .join(", "),
        })
      : t("recapAllClear");

  return (
    <span className="text-[12px] text-fg-muted" title={text}>
      {text}
    </span>
  );
}
