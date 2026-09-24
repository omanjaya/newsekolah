"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import { Badge, Button, Progress, cn } from "@newsekolah/ui";
import { Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { PeriodRef } from "../../reference/api";
import type { SessionSummary } from "../api";
import { type SessionFillStatus } from "../lib/session-schedule";

/**
 * One session on the day list: class, subject, period/time, a highlight
 * when it is the lesson happening now or the next one, the fill-progress
 * bar, and the status badge (docs/07-ui-ux.md: "Belum diisi / Tersimpan
 * pukul HH:MM / Terkunci"). One primary action per card.
 */
export function AttendanceSessionCard({
  session,
  className,
  subjectName,
  start,
  end,
  fillStatus,
  timing,
  submitting,
  timeZone,
  onOpen,
}: {
  session: SessionSummary;
  className: string;
  subjectName: string;
  start?: PeriodRef;
  end?: PeriodRef;
  fillStatus: SessionFillStatus;
  timing: "ongoing" | "next" | null;
  submitting: boolean;
  timeZone?: string;
  onOpen: () => void;
}): ReactElement {
  const t = useTranslations("app.attendance");
  const locale = useLocale() as Locale;

  const roster = session.roster_count ?? 0;
  const entered = session.entered_count ?? 0;
  const progressPercent = roster > 0 ? Math.round((entered / roster) * 100) : 0;

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-sm border bg-surface p-4 md:flex-row md:items-center md:justify-between",
        timing === "ongoing" ? "border-accent ring-1 ring-accent/40" : "border-border",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {timing === "ongoing" && <Badge variant="accent">{t("ongoingBadge")}</Badge>}
          {timing === "next" && <Badge variant="neutral">{t("nextBadge")}</Badge>}
          <span className="text-[15px] font-medium text-fg">{className}</span>
          <span className="text-[14px] text-fg-muted">{subjectName}</span>
          {session.is_substitute && <Badge variant="accent">{t("substituteBadge")}</Badge>}
        </div>
        <span className="text-[13px] text-fg-muted">
          {start && end
            ? `${start.name} - ${end.name} (${start.starts_at.slice(0, 5)}-${end.ends_at.slice(0, 5)})`
            : ""}
        </span>
        {roster > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <Progress value={progressPercent} className="w-32" />
            <span className="text-[12px] text-fg-muted tabular-nums">
              {t("fillProgress", { entered, roster })}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        {fillStatus === "empty" && <Badge variant="neutral">{t("statusPending")}</Badge>}
        {fillStatus === "saved" && (
          <Badge variant="accent">
            {t("statusSavedAt", {
              time: session.submitted_at
                ? formatTime(session.submitted_at, { locale, timeZone })
                : "",
            })}
          </Badge>
        )}
        {fillStatus === "locked" && (
          <Badge variant="neutral">
            <Lock className="size-3" aria-hidden="true" />
            {t("statusLocked")}
          </Badge>
        )}
        <Button
          size="sm"
          variant={fillStatus === "empty" ? "primary" : "secondary"}
          loading={submitting}
          onClick={onOpen}
        >
          {fillStatus === "empty" ? t("fillAttendance") : t("openSubmitted")}
        </Button>
      </div>
    </li>
  );
}
