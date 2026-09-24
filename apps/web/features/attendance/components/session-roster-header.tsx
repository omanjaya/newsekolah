"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Badge, PageHeader } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useLookup, usePeriodsQuery } from "../../reference/api";
import type { SessionDetail } from "../api";

/**
 * The roster's identity: class, subject, date spelled out, lesson period
 * and time, meeting number, and the back link -- everything a teacher
 * needs to confirm "this is the right lesson" before touching a single
 * status (docs/07-ui-ux.md's roster problems: "tidak ada date/time... dan
 * tidak ada back link").
 */
export function SessionRosterHeader({
  session,
  className,
  subjectName,
  isCorrection,
  timeZone,
}: {
  session: SessionDetail;
  className: string;
  subjectName: string;
  isCorrection: boolean;
  timeZone?: string;
}): ReactElement {
  const t = useTranslations("app.attendance.session");
  const locale = useLocale() as Locale;
  const periods = usePeriodsQuery();
  const periodMap = useLookup(periods.data?.data);
  const start = periodMap.get(session.start_period_id);
  const end = periodMap.get(session.end_period_id);

  const dateLabel = formatDate(session.date, { locale, timeZone });
  const periodLabel =
    start && end
      ? `${start.name}${end.id !== start.id ? ` - ${end.name}` : ""} (${start.starts_at.slice(0, 5)}-${end.ends_at.slice(0, 5)})`
      : "";

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        eyebrow={t("eyebrow", { meeting: session.meeting_number })}
        title={`${className} ${subjectName}`.trim() || t("title")}
        breadcrumb={[{ label: t("back"), href: "/attendance" }]}
        actions={isCorrection ? <Badge variant="accent">{t("correctionMode")}</Badge> : undefined}
      />
      <p className="text-[13px] text-fg-muted">
        {dateLabel}
        {periodLabel && <> &middot; {periodLabel}</>}
      </p>
    </div>
  );
}
