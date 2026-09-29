"use client";

import { ApiError } from "@newsekolah/api-client";
import { Badge } from "@newsekolah/ui";
import { Clock3 } from "lucide-react";
import type { ReactElement } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { usePeriodTodayQuery } from "../../academic/api-enrollment";
import { formatPeriodTime } from "../period-span";

/**
 * The period in session right now, as one pill in the header instead of
 * the old full-width bordered strip (`TodayPeriodBanner`, still used on
 * its own by the academic screens): the schedule header already carries
 * the view switch, the picker, the year, and the manage actions, so the
 * "where am I now" answer joins them as a badge rather than its own row.
 * Renders nothing outside school hours or while the query has not
 * resolved, keeping the header uncluttered rather than announcing an
 * empty state every time the school day is over.
 */
export function ScheduleCurrentPeriodPill(): ReactElement | null {
  const year = useActiveYear();
  const query = usePeriodTodayQuery(year.id);

  if (query.isLoading || year.id === "") return null;
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  if (query.isError && !notFound) return null;
  if (!query.data) return null;

  // The period name already says "Istirahat N" for a break (cmd/seed's
  // period template), so the badge does not repeat it as a separate word.
  return (
    <Badge variant={query.data.is_break ? "neutral" : "accent"} className="gap-1.5 py-1">
      <Clock3 className="size-3.5" aria-hidden="true" />
      <span>{query.data.name}</span>
      <span className="tabular-nums">{formatPeriodTime(query.data)}</span>
    </Badge>
  );
}
