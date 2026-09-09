"use client";

import { Button, Skeleton, cn } from "@newsekolah/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { todayInZone, useMyCalendarQuery } from "../api";

const STATUS_CLASS: Record<string, string> = {
  H: "bg-status-present/15 text-status-present",
  S: "bg-status-sick/15 text-status-sick",
  I: "bg-status-excused/15 text-status-excused",
  D: "bg-status-dispensation/15 text-status-dispensation",
  A: "bg-status-absent/15 text-status-absent",
  INCOMPLETE: "bg-status-late/15 text-status-late",
  MIXED: "bg-bg text-fg",
};

/** A student's month view: one daily status per day from the API's algorithm. */
export function AttendanceCalendar(): ReactElement {
  const t = useTranslations("app.attendance.calendar");
  const tDays = useTranslations("app.common.weekdaysShort");
  const { me } = useSession();
  const today = todayInZone(me?.tenant.timezone);
  const [month, setMonth] = useState(today.slice(0, 7));
  const { data, isLoading } = useMyCalendarQuery(month);

  const byDate = useMemo(() => new Map((data?.data ?? []).map((day) => [day.date, day])), [data]);

  const [yearNum, monthNum] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(yearNum, monthNum - 1, 1));
  const daysInMonth = new Date(Date.UTC(yearNum, monthNum, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function shift(delta: number) {
    const d = new Date(Date.UTC(yearNum, monthNum - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const monthLabel = new Intl.DateTimeFormat(me?.tenant.locale === "en" ? "en-US" : "id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(first);

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const day of data?.data ?? []) {
      if (day.status_code === "NONE") continue;
      counts[day.status_code] = (counts[day.status_code] ?? 0) + 1;
    }
    return counts;
  }, [data]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          icon={<ChevronLeft />}
          onClick={() => {
            shift(-1);
          }}
          aria-label={t("prevMonth")}
        >
          {t("prevMonth")}
        </Button>
        <h2 className="text-[16px] font-medium text-fg">{monthLabel}</h2>
        <Button
          variant="ghost"
          size="sm"
          icon={<ChevronRight />}
          onClick={() => {
            shift(1);
          }}
          aria-label={t("nextMonth")}
        >
          {t("nextMonth")}
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-80 w-full" aria-busy="true" />
      ) : (
        <div className="grid grid-cols-7 gap-1 rounded-sm border border-border bg-surface p-2">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <div key={d} className="py-1 text-center text-[12px] font-medium text-fg-muted">
              {tDays(String(d))}
            </div>
          ))}
          {cells.map((date, index) => {
            if (!date) return <div key={`empty-${index}`} />;
            const day = byDate.get(date);
            const code = day?.status_code ?? "NONE";
            const isToday = date === today;
            return (
              <div
                key={date}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xs border text-[13px]",
                  isToday ? "border-accent" : "border-transparent",
                  code !== "NONE" ? STATUS_CLASS[code] : "text-fg-muted",
                )}
                title={
                  day
                    ? t("dayTitle", {
                        expected: day.expected_sessions,
                        submitted: day.submitted_sessions,
                      })
                    : undefined
                }
              >
                <span>{Number(date.slice(-2))}</span>
                {code !== "NONE" && (
                  <span className="text-[11px] font-semibold">{t(`codes.${code}`)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      <dl className="flex flex-wrap gap-4 text-[13px]">
        {Object.entries(summary).map(([code, count]) => (
          <div key={code} className="flex items-center gap-1">
            <dt className="text-fg-muted">{t(`codes.${code}`)}</dt>
            <dd className="font-medium text-fg">{count}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
