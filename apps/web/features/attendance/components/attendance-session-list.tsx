"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import { Badge, Button, HeroCard, List, ListRow, Progress, SectionHeader } from "@newsekolah/ui";
import { Lock, UserRoundCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import type { PeriodRef } from "../../reference/api";
import { clockLabel, clockRange } from "../../schedule/clock-label";
import type { SessionSummary } from "../api";
import { deriveSessionCardAction } from "../lib/session-card-action";
import type { SessionFillStatus } from "../lib/session-schedule";

/** Everything one session needs on the day list, resolved by the view. */
export interface DaySessionItem {
  session: SessionSummary;
  className: string;
  subjectName: string;
  start?: PeriodRef;
  end?: PeriodRef;
  fillStatus: SessionFillStatus;
  timing: "ongoing" | "next" | null;
  submitting: boolean;
}

function useSessionText(item: DaySessionItem) {
  const t = useTranslations("app.attendance");
  const locale = useLocale();
  const roster = item.session.roster_count ?? 0;
  const entered = item.session.entered_count ?? 0;
  const periods = item.start && item.end ? `${item.start.name} – ${item.end.name}` : "";
  const meta = [
    periods,
    roster > 0 ? t("fillProgress", { entered, roster }) : "",
    item.session.is_substitute ? t("substituteBadge") : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    title: [item.subjectName, item.className].filter(Boolean).join(" · "),
    meta,
    roster,
    entered,
    time: item.start && item.end ? clockRange(item.start.starts_at, item.end.ends_at, locale) : "",
  };
}

/** Saved, locked or still to fill, as one badge. */
function StatusBadge({
  item,
  timeZone,
}: {
  item: DaySessionItem;
  timeZone?: string;
}): ReactElement {
  const t = useTranslations("app.attendance");
  const locale = useLocale() as Locale;
  if (item.fillStatus === "upcoming") {
    return (
      <Badge tone="neutral" size="sm">
        {t("statusUpcoming")}
      </Badge>
    );
  }
  if (item.fillStatus === "locked") {
    return (
      <Badge tone="neutral" size="sm">
        <Lock className="size-3" aria-hidden="true" />
        {t("statusLocked")}
      </Badge>
    );
  }
  if (item.fillStatus === "handedOver") {
    return (
      <Badge tone="neutral" size="sm">
        <UserRoundCheck className="size-3" aria-hidden="true" />
        {t("statusHandedOver")}
      </Badge>
    );
  }
  if (item.fillStatus !== "empty") {
    return (
      <Badge tone="success" size="sm" dot>
        {t("statusSavedAt", {
          time: item.session.submitted_at
            ? formatTime(item.session.submitted_at, { locale, timeZone })
            : "",
        })}
      </Badge>
    );
  }
  if (item.timing === "next") {
    return (
      <Badge tone="neutral" size="sm">
        {t("nextBadge")}
      </Badge>
    );
  }
  return (
    <Badge tone="warning" size="sm" dot>
      {t("statusPending")}
    </Badge>
  );
}

/**
 * The lesson running now (or the next one today) as the screen's hero: its
 * time, "Mapel · Kelas", how much of the roster is in, and the one action,
 * full width under a thumb on a phone.
 */
export function AttendanceSessionHero({
  item,
  timeZone,
  onOpen,
}: {
  item: DaySessionItem;
  timeZone?: string;
  onOpen: () => void;
}): ReactElement {
  const t = useTranslations("app.attendance");
  const text = useSessionText(item);
  const action = deriveSessionCardAction(item.fillStatus, item.timing);
  const ongoing = item.timing === "ongoing";
  return (
    <HeroCard
      data-testid="attendance-session-hero"
      tone={ongoing ? "accent-soft" : "neutral"}
      eyebrow={ongoing ? t("heroOngoing") : t("heroNext")}
      chip={text.time || undefined}
      live={ongoing}
      title={text.title}
      meta={text.meta}
      action={
        <Button
          size="lg"
          variant={action === "fill" ? "primary" : "secondary"}
          loading={item.submitting}
          disabled={action === "upcoming"}
          onClick={onOpen}
          className="w-full sm:w-auto"
        >
          {action === "fill"
            ? t("fillAttendance")
            : action === "open"
              ? t("openSubmitted")
              : action === "upcoming"
                ? t("statusUpcoming")
                : t("viewSaved")}
        </Button>
      }
      secondaryAction={action === "saved" ? <StatusBadge item={item} timeZone={timeZone} /> : null}
    >
      {text.roster > 0 && (
        <Progress
          value={text.entered}
          max={text.roster}
          aria-label={t("fillProgress", { entered: text.entered, roster: text.roster })}
          className="max-w-xs pt-1"
        />
      )}
    </HeroCard>
  );
}

/**
 * The day's sessions as one list: the start time leads, "Mapel · Kelas"
 * with its periods and fill progress, and the session's state at the end.
 * The whole row opens the session.
 */
export function AttendanceSessionList({
  title,
  items,
  timeZone,
  onOpen,
}: {
  title: ReactNode;
  items: DaySessionItem[];
  timeZone?: string;
  onOpen: (item: DaySessionItem) => void;
}): ReactElement {
  const locale = useLocale();
  return (
    <section className="flex flex-col gap-3" data-testid="attendance-session-list">
      <SectionHeader title={title} count={items.length} />
      <List framed>
        {items.map((item) => (
          <SessionRow
            key={item.session.schedule_id}
            item={item}
            locale={locale}
            timeZone={timeZone}
            onOpen={onOpen}
          />
        ))}
      </List>
    </section>
  );
}

function SessionRow({
  item,
  locale,
  timeZone,
  onOpen,
}: {
  item: DaySessionItem;
  locale: string;
  timeZone?: string;
  onOpen: (item: DaySessionItem) => void;
}): ReactElement {
  const text = useSessionText(item);
  return (
    <ListRow
      data-testid={`attendance-session-row-${item.session.schedule_id}`}
      leading={
        <span className="flex w-12 flex-col text-label text-fg tabular-nums">
          {item.start ? clockLabel(item.start.starts_at, locale) : "--.--"}
          {item.end && (
            <span className="text-caption font-normal text-fg-muted">
              {clockLabel(item.end.ends_at, locale)}
            </span>
          )}
        </span>
      }
      title={text.title}
      meta={text.meta}
      trailing={<StatusBadge item={item} timeZone={timeZone} />}
      // A lesson on a later day cannot be opened: nothing to record yet.
      disabled={item.submitting || item.fillStatus === "upcoming"}
      onClick={() => {
        onOpen(item);
      }}
    />
  );
}
