"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import { Badge, Button, Card, Progress, cn } from "@newsekolah/ui";
import { Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { PeriodRef } from "../../reference/api";
import type { SessionSummary } from "../api";
import { deriveSessionCardAction } from "../lib/session-card-action";
import { type SessionFillStatus } from "../lib/session-schedule";

/**
 * One session on the bento day list (docs/07-ui-ux.md): large start time on
 * the left, "Mapel · Kelas" title, a meta line with the period range and
 * fill progress, a thin progress bar, and on the right one primary action --
 * "Isi presensi" for the running unsubmitted lesson, the quieter "Buka" for
 * any other unsubmitted one, or the "Tersimpan" badge (still clickable) once
 * it is submitted. The running session gets an accent ring.
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
  const action = deriveSessionCardAction(fillStatus, timing);

  const periodText =
    start && end
      ? `${start.name} - ${end.name} (${start.starts_at.slice(0, 5)}-${end.ends_at.slice(0, 5)})`
      : "";
  const fillProgressText = t("fillProgress", { entered, roster });
  const metaText =
    roster > 0 && periodText
      ? `${periodText} · ${fillProgressText}`
      : roster > 0
        ? fillProgressText
        : periodText;

  return (
    <Card
      className={cn(
        "flex h-full flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between",
        timing === "ongoing" && "border-accent ring-1 ring-accent",
      )}
      data-testid={`attendance-session-card-${session.schedule_id}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex shrink-0 flex-col items-center pt-0.5">
          <span className="font-heading text-[20px] leading-none font-bold tabular-nums text-fg">
            {start ? start.starts_at.slice(0, 5) : "--:--"}
          </span>
          {end && (
            <span className="text-[12px] text-fg-muted tabular-nums">
              {end.ends_at.slice(0, 5)}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {timing === "ongoing" && <Badge variant="accent">{t("ongoingBadge")}</Badge>}
            {timing === "next" && <Badge variant="neutral">{t("nextBadge")}</Badge>}
            {session.is_substitute && <Badge variant="accent">{t("substituteBadge")}</Badge>}
          </div>
          <p className="truncate text-[15px] font-medium text-fg">
            {subjectName} <span className="text-fg-muted">&middot;</span> {className}
          </p>
          {metaText && <p className="text-[13px] text-fg-muted">{metaText}</p>}
          {roster > 0 && <Progress value={progressPercent} className="w-full max-w-[10rem] pt-1" />}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-end md:self-auto">
        {action === "saved" ? (
          <button
            type="button"
            onClick={onOpen}
            disabled={submitting}
            className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1.5 text-[12px] font-medium text-accent-soft-fg transition-colors hover:bg-accent-soft/80 disabled:pointer-events-none disabled:opacity-50"
          >
            {fillStatus === "locked" ? (
              <>
                <Lock className="size-3" aria-hidden="true" />
                {t("statusLocked")}
              </>
            ) : (
              t("statusSavedAt", {
                time: session.submitted_at
                  ? formatTime(session.submitted_at, { locale, timeZone })
                  : "",
              })
            )}
          </button>
        ) : (
          <Button
            size="sm"
            variant={action === "fill" ? "primary" : "secondary"}
            loading={submitting}
            onClick={onOpen}
          >
            {action === "fill" ? t("fillAttendance") : t("openSubmitted")}
          </Button>
        )}
      </div>
    </Card>
  );
}
