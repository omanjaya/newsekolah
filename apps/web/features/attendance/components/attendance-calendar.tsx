"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  IconButton,
  Skeleton,
  StatTile,
  StatusBadge,
  cn,
} from "@newsekolah/ui";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  FileText,
  Thermometer,
  UserX,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { statusToken } from "../../../lib/attendance-status";
import { tileColumns } from "../../../lib/layout/bento";
import { useSession } from "../../../lib/session/session-provider";
import { todayInZone, useMyCalendarQuery } from "../api";
import { monthAttendanceStats } from "../lib/attendance-stats";

/** Solid status dot for a calendar day cell -- distinct from the 15%-opacity blocks status-tokens.ts builds for the roster/report screens. */
const STATUS_DOT_CLASS: Record<string, string> = {
  H: "bg-status-present",
  S: "bg-status-sick",
  I: "bg-status-excused",
  D: "bg-status-dispensation",
  A: "bg-status-absent",
  INCOMPLETE: "bg-status-late",
  MIXED: "bg-fg-muted",
};

/** Fixed display order for the legend, independent of the calendar's own day-of-month iteration order. */
const LEGEND_ORDER = ["H", "S", "I", "D", "A", "INCOMPLETE", "MIXED"];

/** A student's month view: a symmetric bento of month stats, a dot calendar, and a detail card for the selected day. */
export function AttendanceCalendar(): ReactElement {
  const t = useTranslations("app.attendance");
  const tCal = useTranslations("app.attendance.calendar");
  const tMine = useTranslations("app.attendance.mine");
  const tDays = useTranslations("app.common.weekdaysShort");
  const { me } = useSession();
  const locale = useLocale() as Locale;
  const timeZone = me?.tenant.timezone;
  const today = todayInZone(timeZone);
  const [month, setMonth] = useState(today.slice(0, 7));
  const { data, isLoading } = useMyCalendarQuery(month);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const days = useMemo(() => data?.data ?? [], [data]);
  const byDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);

  const [yearNum, monthNum] = month.split("-").map(Number) as [number, number];
  const { first, cells } = useMemo(() => {
    const monthFirst = new Date(Date.UTC(yearNum, monthNum - 1, 1));
    const daysInMonth = new Date(Date.UTC(yearNum, monthNum, 0)).getUTCDate();
    const leading = (monthFirst.getUTCDay() + 6) % 7;
    const grid: (string | null)[] = [
      ...Array.from({ length: leading }, () => null),
      ...Array.from(
        { length: daysInMonth },
        (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
      ),
    ];
    while (grid.length % 7 !== 0) grid.push(null);
    return { first: monthFirst, cells: grid };
  }, [yearNum, monthNum, month]);
  const dateCells = useMemo(() => cells.filter((c): c is string => c !== null), [cells]);

  function shift(delta: number) {
    const d = new Date(Date.UTC(yearNum, monthNum - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const monthLabel = new Intl.DateTimeFormat(me?.tenant.locale === "en" ? "en-US" : "id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(first);

  const stats = useMemo(() => monthAttendanceStats(days, today), [days, today]);
  const legendEntries = LEGEND_ORDER.flatMap((code) => {
    const count = stats.counts[code];
    return count ? [[code, count] as const] : [];
  });

  // Today if this month's grid holds it, else the latest day with data,
  // else nothing selected yet (an empty month, e.g. before the school year starts).
  const defaultSelected = useMemo(() => {
    if (dateCells.includes(today)) return today;
    const known = [...days]
      .filter((d) => d.date <= today && d.status_code !== "NONE")
      .sort((a, b) => b.date.localeCompare(a.date));
    return known[0]?.date ?? null;
  }, [dateCells, days, today]);

  const effectiveSelected =
    selectedDate && dateCells.includes(selectedDate) ? selectedDate : defaultSelected;
  const selectedDay = effectiveSelected ? byDate.get(effectiveSelected) : undefined;
  const selectedIsFuture = effectiveSelected ? effectiveSelected > today : false;
  const selectedCode = selectedIsFuture ? "NONE" : (selectedDay?.status_code ?? "NONE");
  const selectedSessions = selectedIsFuture ? [] : (selectedDay?.sessions ?? []);
  const selectedToken = selectedCode !== "NONE" ? statusToken(selectedCode) : undefined;

  const tileGrid = tileColumns(4);
  const tiles = [
    {
      key: "present",
      icon: CalendarCheck,
      tone: "green" as const,
      value: stats.presentRate !== undefined ? `${stats.presentRate}%` : "-",
      label: tMine("statPresentLabel"),
    },
    {
      key: "sick",
      icon: Thermometer,
      tone: "amber" as const,
      value: String(stats.counts.S ?? 0),
      label: tMine("statSickLabel"),
    },
    {
      key: "excused",
      icon: FileText,
      tone: "blue" as const,
      value: String(stats.counts.I ?? 0),
      label: tMine("statExcusedLabel"),
    },
    {
      key: "absent",
      icon: UserX,
      tone: "red" as const,
      value: String(stats.counts.A ?? 0),
      label: tMine("statAbsentLabel"),
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-1 text-[13px] font-medium text-fg-muted">{t("eyebrow")}</p>
          <h2 className="font-heading text-[20px] font-bold tracking-tight text-fg">
            {tMine("title")}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            icon={<ChevronLeft />}
            variant="outline"
            className="rounded-full"
            aria-label={tCal("prevMonth")}
            onClick={() => {
              shift(-1);
            }}
          />
          <span className="rounded-full border border-border bg-surface px-4 py-1.5 text-[13px] font-medium text-fg">
            {monthLabel}
          </span>
          <IconButton
            icon={<ChevronRight />}
            variant="outline"
            className="rounded-full"
            aria-label={tCal("nextMonth")}
            onClick={() => {
              shift(1);
            }}
          />
        </div>
      </div>

      <div className={tileGrid.container} data-testid="attendance-mine-tiles">
        {tiles.map((tile, index) => (
          <StatTile
            key={tile.key}
            className={cn("h-full", index === tiles.length - 1 && tileGrid.lastTileClassName)}
            icon={tile.icon}
            tone={tile.tone}
            value={tile.value}
            label={tile.label}
          />
        ))}
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>{tMine("calendarTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 pt-0">
            {isLoading ? (
              <Skeleton className="h-72 w-full" aria-busy="true" />
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <div key={d} className="py-1 text-center text-[12px] font-medium text-fg-muted">
                    {tDays(String(d))}
                  </div>
                ))}
                {cells.map((date, index) => {
                  if (!date) return <div key={`empty-${index}`} />;
                  const day = byDate.get(date);
                  const isToday = date === today;
                  const isSelected = date === effectiveSelected;
                  // A day that has not happened yet has no status to show --
                  // the API still returns "belum lengkap" for it (no
                  // sessions submitted), which would otherwise scare a
                  // student into thinking they missed a day that has not
                  // started.
                  const isFuture = date > today;
                  const code = isFuture ? "NONE" : (day?.status_code ?? "NONE");
                  const muted = code === "NONE";
                  const dotClass = STATUS_DOT_CLASS[code];
                  const statusLabel = tCal(`codes.${code}`);
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => {
                        setSelectedDate(date);
                      }}
                      aria-pressed={isSelected}
                      aria-label={tMine("dayAriaLabel", {
                        date: formatDate(date, { locale, timeZone }),
                        status: statusLabel,
                      })}
                      className={cn(
                        "flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-xs border text-[13px]",
                        "border-border bg-surface transition-colors hover:bg-bg",
                        "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
                        isToday && "border-accent",
                        isSelected && "bg-accent-soft",
                        muted && "text-fg-muted",
                      )}
                    >
                      <span className={muted ? "text-fg-muted" : "text-fg"}>
                        {Number(date.slice(-2))}
                      </span>
                      {dotClass && (
                        <span
                          aria-hidden="true"
                          className={cn("size-1.5 shrink-0 rounded-full", dotClass)}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>
              {effectiveSelected
                ? formatDate(effectiveSelected, { locale, timeZone })
                : tMine("detailEmptyTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3 pt-0">
            {!effectiveSelected ? (
              <p className="text-[13px] text-fg-muted">{tMine("detailEmptyBody")}</p>
            ) : (
              <>
                {selectedToken ? (
                  <StatusBadge status={selectedToken} label={tCal(`codes.${selectedCode}`)} />
                ) : (
                  <Badge variant="neutral">{tCal(`codes.${selectedCode}`)}</Badge>
                )}
                {selectedSessions.length > 0 ? (
                  <ul className="flex flex-col divide-y divide-border">
                    {selectedSessions.map((session) => {
                      const sessionToken = session.status_code
                        ? statusToken(session.status_code)
                        : undefined;
                      return (
                        <li
                          key={session.schedule_id}
                          className="flex flex-col gap-0.5 py-2 text-[13px]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-fg">
                              {session.subject_name ?? tCal("unknownSubject")}
                            </span>
                            {sessionToken ? (
                              <StatusBadge
                                status={sessionToken}
                                label={tCal(`codes.${session.status_code}`)}
                              />
                            ) : session.status_code ? (
                              <span className="text-fg-muted">
                                {tCal(`codes.${session.status_code}`)}
                              </span>
                            ) : null}
                          </div>
                          <span className="text-fg-muted">
                            {[session.period_label, session.teacher_name]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          {session.note && <span className="text-fg-muted">{session.note}</span>}
                          {session.source && session.source !== "teacher" && (
                            <span className="text-fg-muted">
                              {tCal(`sessionSource.${session.source}`)}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-[13px] text-fg-muted">
                    {tMine("daySentence", { status: tCal(`codes.${selectedCode}`) })}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <dl className="flex flex-wrap gap-4 text-[13px]" aria-label={tMine("legendLabel")}>
        {legendEntries.map(([code, count]) => (
          <div key={code} className="flex items-center gap-1.5">
            <dt className="flex items-center gap-1.5 text-fg-muted">
              <span
                aria-hidden="true"
                className={cn("size-2.5 shrink-0 rounded-full", STATUS_DOT_CLASS[code])}
              />
              {tCal(`codes.${code}`)}
            </dt>
            <dd className="font-medium text-fg">{count}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
