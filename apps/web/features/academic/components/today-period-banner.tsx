"use client";

import { ApiError } from "@newsekolah/api-client";
import { Badge } from "@newsekolah/ui";
import { Clock3 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { usePeriodTodayQuery } from "../api-enrollment";

/**
 * Small status strip for the schedule screen: the period in session right
 * now, or a quiet "no lesson right now" line outside teaching hours. A 404
 * from the endpoint means exactly that -- not a fetch failure -- so it is
 * not surfaced as an error state.
 */
export function TodayPeriodBanner(): ReactElement | null {
  const t = useTranslations("app.academic.today");
  const year = useActiveYear();
  const query = usePeriodTodayQuery(year.id);

  if (query.isLoading || year.id === "") return null;

  const notFound = query.error instanceof ApiError && query.error.status === 404;
  if (query.isError && !notFound) return null;

  return (
    <div className="flex items-center gap-2 rounded-xs border border-border bg-surface px-3 py-2 text-[13px]">
      <Clock3 className="size-4 text-fg-muted" aria-hidden="true" />
      {query.data ? (
        <>
          <span className="font-medium">{query.data.name}</span>
          <span className="text-fg-muted">
            {query.data.starts_at.slice(0, 5)}-{query.data.ends_at.slice(0, 5)}
          </span>
          {query.data.is_break && <Badge variant="neutral">{t("break")}</Badge>}
        </>
      ) : (
        <span className="text-fg-muted">{t("noPeriodNow")}</span>
      )}
    </div>
  );
}
