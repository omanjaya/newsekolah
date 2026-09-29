"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Badge, Button, PageHeader } from "@newsekolah/ui";
import { ArrowLeft, CheckCheck, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useAllPeriodsQuery, useLookup } from "../../reference/api";
import type { SessionDetail } from "../api";

/**
 * The roster's identity: a clearly visible back link, "Mapel · Kelas" as
 * the title (font-heading, matching the dashboard's bento header language),
 * date and lesson time on the meta line, and the two bulk-roster actions as
 * secondary pill buttons on the right (docs/07-ui-ux.md's roster problems:
 * "tidak ada date/time... dan tidak ada back link" -- a breadcrumb-style
 * eyebrow alone was not visible enough, hence the standalone button above
 * it). Owns "Tandai semua hadir"/"Kosongkan perubahan" instead of the
 * roster panel below it: they read as page-level actions on the whole
 * session, not filters scoped to the visible list.
 *
 * Periods come from `useAllPeriodsQuery` (every template), not
 * `usePeriodsQuery` (the tenant's default template only): a schedule
 * built on a second, non-default timetable template -- e.g. a
 * bulk-imported one alongside a hand-built default -- has periods the
 * default-only lookup cannot resolve, which used to leave this line
 * blank instead of showing the actual period/time.
 */
export function SessionRosterHeader({
  session,
  className,
  subjectName,
  isCorrection,
  timeZone,
  onMarkAllPresent,
  onResetChanges,
  canReset,
  disabled,
}: {
  session: SessionDetail;
  className: string;
  subjectName: string;
  isCorrection: boolean;
  timeZone?: string;
  onMarkAllPresent: () => void;
  onResetChanges: () => void;
  canReset: boolean;
  disabled: boolean;
}): ReactElement {
  const t = useTranslations("app.attendance.session");
  const tEditor = useTranslations("app.attendance.editor");
  const locale = useLocale() as Locale;
  const periods = useAllPeriodsQuery();
  const periodMap = useLookup(periods.data?.data);
  const start = periodMap.get(session.start_period_id);
  const end = periodMap.get(session.end_period_id);

  const dateLabel = formatDate(session.date, { locale, timeZone });
  const timeRange =
    start && end
      ? tEditor("timeRange", { start: start.starts_at.slice(0, 5), end: end.ends_at.slice(0, 5) })
      : null;

  const titleParts = [subjectName, className].filter((part) => part.trim() !== "");
  const title = titleParts.length > 0 ? titleParts.join(" · ") : t("title");

  return (
    <div className="flex flex-col gap-2">
      <Button asChild variant="secondary" size="sm" className="self-start">
        <Link href="/attendance">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("backToList")}
        </Link>
      </Button>
      <PageHeader
        eyebrow={t("eyebrow", { meeting: session.meeting_number })}
        title={title}
        breadcrumb={[{ label: t("back"), href: "/attendance" }]}
        actions={
          <>
            {isCorrection && <Badge variant="accent">{t("correctionMode")}</Badge>}
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full"
              disabled={disabled}
              onClick={onMarkAllPresent}
            >
              <CheckCheck className="size-4" aria-hidden="true" />
              {t("markAllPresent")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full"
              disabled={disabled || !canReset}
              onClick={onResetChanges}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              {t("resetChanges")}
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] text-fg-muted">
          {dateLabel}
          {timeRange && <> &middot; {timeRange}</>}
        </p>
        <p className="text-[11px] text-fg-muted">{t("markAllPresentHint")}</p>
      </div>
    </div>
  );
}
