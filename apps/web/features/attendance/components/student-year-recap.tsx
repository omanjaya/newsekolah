"use client";

import { cn, type StatusName } from "@newsekolah/ui";
import type { ReactElement } from "react";

import type { SessionDetail } from "../api";
import { statusToken } from "../lib/status-tokens";

type AttendanceStatus = SessionDetail["statuses"][number];

const DOT_CLASS: Record<StatusName, string> = {
  present: "bg-status-present",
  sick: "bg-status-sick",
  excused: "bg-status-excused",
  dispensation: "bg-status-dispensation",
  absent: "bg-status-absent",
  late: "bg-status-late",
};

/**
 * A student's running exception-status totals for the academic year
 * (e.g. "S 1 I 0 D 3 A 0"), next to their name on the roster --
 * every status that does not count as present, so a teacher can spot a
 * pattern (a student often sick, or accumulating unexplained absences)
 * without leaving the roster. Present itself is left out: a recap of how
 * often someone showed up is not the point of this chip row.
 *
 * Renders nothing when every exception count is zero: a clean-slate
 * student on an ordinary day should not carry a row of "S0 I0 D0 A0" the
 * way a genuinely-flagged one carries real numbers -- and it keeps the
 * common row's height down, since most students most days have nothing
 * to recap.
 */
export function StudentYearRecap({
  statuses,
  yearCounts,
}: {
  statuses: AttendanceStatus[];
  yearCounts?: Record<string, number>;
}): ReactElement | null {
  const exceptions = statuses.filter((s) => !s.counts_as_present);
  if (exceptions.length === 0) return null;
  const hasAnyCount = exceptions.some((s) => (yearCounts?.[s.code] ?? 0) > 0);
  if (!hasAnyCount) return null;

  const summary = exceptions.map((s) => `${s.label} ${yearCounts?.[s.code] ?? 0}`).join(", ");

  return (
    <span className="flex items-center gap-1.5" aria-label={summary} title={summary}>
      {exceptions.map((s) => {
        const token = statusToken(s.code);
        const count = yearCounts?.[s.code] ?? 0;
        return (
          <span
            key={s.code}
            aria-hidden="true"
            className={cn(
              "flex items-center gap-0.5 text-[11px] tabular-nums",
              count > 0 ? "text-fg" : "text-fg-muted/60",
            )}
          >
            <span
              className={cn("size-1.5 rounded-full", token ? DOT_CLASS[token] : undefined)}
              style={token ? undefined : { backgroundColor: s.color }}
            />
            {s.code}
            {count}
          </span>
        );
      })}
    </span>
  );
}
