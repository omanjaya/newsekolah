"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Badge,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  IconButton,
  List,
  ListRow,
  SkeletonCards,
  Stat,
  StatGrid,
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

import { AppPage } from "../../../components/app-page";
import { statusToken } from "../../../lib/attendance-status";
import { useSession } from "../../../lib/session/session-provider";
import { useSimulation } from "../../../lib/simulation/clock";
import { todayInZone, useMyCalendarQuery } from "../api";
import { monthAttendanceStats } from "../lib/attendance-stats";
import { sourceNoteText } from "../lib/source-note";

/** Solid status dot for a calendar day cell -- distinct from the 15%-opacity blocks status-tokens.ts builds for the roster/report screens. */
const STATUS_DOT_CLASS: Record<string, string> = {
  H: "bg-status-present",
  S: "bg-status-sick",
  I: "bg-status-excused",
  D: "bg-status-dispensation",
  A: "bg-status-absent",
  // The late (amber) family, as lib/attendance-status maps INCOMPLETE for
  // the day's badge and every report. A hollow ring, so the dot reads as
  // unfinished and stays apart from the solid sick (amber-brown) dot.
  INCOMPLETE: "bg-transparent ring-[1.5px] ring-inset ring-status-late",
  // No status token: one neutral dot, and a neutral badge in the day card.
  MIXED: "bg-fg-muted",
};

/** Fixed display order for the legend, independent of the calendar's own day-of-month iteration order. */
const LEGEND_ORDER = ["H", "S", "I", "D", "A", "INCOMPLETE", "MIXED"];

/** A student's month view: a symmetric bento of month stats, a dot calendar, and a detail card for the selected day. */
export function AttendanceCalendar(): ReactElement {
  useSimulation();
  const tAttendance = useTranslations("app.attendance");
  const tCal = useTranslations("app.attendance.calendar");
  const tMine = useTranslations("app.attendance.mine");
  const tDays = useTranslations("app.common.weekdaysShort");
  const { me } = useSession();
  const locale = useLocale() as Locale;
  const timeZone = me?.tenant.timezone;
  const today = todayInZone(timeZone);
  // Keyed by `today` so a simulated clock jump re-anchors the calendar on
  // the new month instead of keeping the month picked before the jump.
  const [selection, setSelection] = useState<{ today: string; month: string } | null>(null);
  const month =
    selection !== null && selection.today === today ? selection.month : today.slice(0, 7);
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
    setSelection({
      today,
      month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    });
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

  // A code with a status token (incomplete among them) gets its status
  // badge; one without (mixed) a calm neutral badge, like its dot.
  const selectedBadge = selectedToken ? (
    <StatusBadge status={selectedToken} label={tCal(`codes.${selectedCode}`)} />
  ) : (
    <Badge tone="neutral">{tCal(`codes.${selectedCode}`)}</Badge>
  );

  return (
    <AppPage
      title={tMine("title")}
      navParams={["date"]}
      actions={
        <div className="flex items-center gap-1.5">
          <IconButton
            icon={<ChevronLeft />}
            variant="surface"
            aria-label={tCal("prevMonth")}
            onClick={() => {
              shift(-1);
            }}
          />
          <span className="min-w-36 text-center text-label text-fg" aria-live="polite">
            {monthLabel}
          </span>
          <IconButton
            icon={<ChevronRight />}
            variant="surface"
            aria-label={tCal("nextMonth")}
            onClick={() => {
              shift(1);
            }}
          />
        </div>
      }
    >
      <StatGrid
        variant="strip"
        aria-label={tMine("statsLabel")}
        data-testid="attendance-mine-tiles"
      >
        <Stat
          icon={<CalendarCheck />}
          tone="green"
          value={stats.presentRate !== undefined ? `${String(stats.presentRate)}%` : "-"}
          label={tMine("statPresentLabel")}
        />
        <Stat
          icon={<Thermometer />}
          tone="amber"
          value={stats.counts.S ?? 0}
          label={tMine("statSickLabel")}
        />
        <Stat
          icon={<FileText />}
          tone="blue"
          value={stats.counts.I ?? 0}
          label={tMine("statExcusedLabel")}
        />
        <Stat
          icon={<UserX />}
          tone="red"
          value={stats.counts.A ?? 0}
          label={tMine("statAbsentLabel")}
        />
      </StatGrid>

      <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle as="h2">{tMine("calendarTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <SkeletonCards count={7} className="grid-cols-7 sm:grid-cols-7" />
            ) : (
              <div className="grid grid-cols-7 gap-y-1">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <div
                    key={d}
                    className={cn(
                      "py-1 text-center text-caption",
                      d >= 6 ? "text-fg-muted/70" : "text-fg-muted",
                    )}
                  >
                    {tDays(String(d))}
                  </div>
                ))}
                {cells.map((date, index) => {
                  if (!date) return <div key={`empty-${String(index)}`} />;
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
                    // A day cell of the student's attendance month, with its
                    // status dot: the shared Calendar has no per-day status.
                    // eslint-disable-next-line design-system/no-raw-elements -- calendar day cell, see above
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
                        "mx-auto flex size-11 flex-col items-center justify-center gap-0.5 rounded-full text-body tabular-nums",
                        "transition-colors hover:bg-state-hover",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                        isToday && "ring-2 ring-accent",
                        isSelected && "bg-accent-soft text-accent-soft-fg hover:bg-accent-soft",
                        muted && !isSelected && "text-fg-muted",
                      )}
                    >
                      <span>{Number(date.slice(-2))}</span>
                      {/* An empty slot keeps every number on the same line. */}
                      <span
                        aria-hidden="true"
                        className={cn("size-1.5 shrink-0", dotClass && "rounded-full", dotClass)}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
          {legendEntries.length > 0 && (
            <CardFooter className="border-t border-line pt-4">
              <dl
                className="flex flex-wrap gap-x-4 gap-y-2 text-body-sm"
                aria-label={tMine("legendLabel")}
              >
                {legendEntries.map(([code, count]) => (
                  <div key={code} className="flex items-center gap-1.5">
                    <dt className="flex items-center gap-1.5 text-fg-muted">
                      <span
                        aria-hidden="true"
                        className={cn("size-2 shrink-0 rounded-full", STATUS_DOT_CLASS[code])}
                      />
                      {tCal(`codes.${code}`)}
                    </dt>
                    <dd className="text-label text-fg">{count}</dd>
                  </div>
                ))}
              </dl>
            </CardFooter>
          )}
        </Card>

        <Card>
          <CardHeader action={effectiveSelected ? selectedBadge : undefined}>
            <CardTitle as="h2">
              {effectiveSelected
                ? formatDate(effectiveSelected, { locale, timeZone })
                : tMine("detailEmptyTitle")}
            </CardTitle>
          </CardHeader>
          {!effectiveSelected ? (
            <CardContent className="pt-0">
              <p className="text-body-sm text-fg-muted">{tMine("detailEmptyBody")}</p>
            </CardContent>
          ) : selectedSessions.length > 0 ? (
            <List>
              {selectedSessions.map((session) => {
                const sessionToken = session.status_code
                  ? statusToken(session.status_code)
                  : undefined;
                const meta = [
                  [session.period_label, session.teacher_name].filter(Boolean).join(" · "),
                  sourceNoteText(session.note, session.source, (number) =>
                    tAttendance("leaveLetterNote", { number }),
                  ),
                  session.source && session.source !== "teacher"
                    ? tCal(`sessionSource.${session.source}`)
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <ListRow
                    key={session.schedule_id}
                    title={session.subject_name ?? tCal("unknownSubject")}
                    meta={meta}
                    trailing={
                      sessionToken ? (
                        <StatusBadge
                          status={sessionToken}
                          label={tCal(`codes.${session.status_code ?? ""}`)}
                        />
                      ) : session.status_code ? (
                        <Badge tone="neutral">{tCal(`codes.${session.status_code}`)}</Badge>
                      ) : undefined
                    }
                  />
                );
              })}
            </List>
          ) : (
            <CardContent className="pt-0">
              <p className="text-body-sm text-fg-muted">
                {tMine("daySentence", { status: tCal(`codes.${selectedCode}`) })}
              </p>
            </CardContent>
          )}
        </Card>
      </div>
    </AppPage>
  );
}
