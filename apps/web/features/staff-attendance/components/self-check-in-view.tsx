"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDate, formatTime, type Locale } from "@newsekolah/i18n";
import {
  Alert,
  Button,
  PageHeader,
  Skeleton,
  StatusBadge,
  cn,
  useToast,
  type StatusName,
} from "@newsekolah/ui";
import { CheckCircle2, LogIn, LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import {
  type AttendanceRecord,
  useScanStaffAttendanceMutation,
  useStaffAttendanceMyHistoryQuery,
} from "../api";
import { shiftDateISO } from "../time";

const STATUS_TOKEN: Partial<Record<AttendanceRecord["status_code"], StatusName>> = {
  present: "present",
  late: "late",
  absent: "absent",
};

const WEEK_DAYS = 7;

/**
 * A teacher's or staff member's own arrival and departure, one tap each.
 * "Today" and "this week" both come from `useStaffAttendanceMyHistoryQuery`
 * (self-service, no `view_staff_attendance` permission needed), so unlike
 * before this no longer needs a device-local `localStorage` guess for what
 * was scanned last -- the server is the only source of truth now, the
 * screen just optimistically shows the scan result while the refetch is
 * in flight.
 */
export function SelfCheckInView(): ReactElement {
  const t = useTranslations("app.staffAttendance.self");
  const tStatus = useTranslations("app.staffAttendance.statuses");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const scan = useScanStaffAttendanceMutation();

  const today = todayInZone(timeZone);
  const from = shiftDateISO(today, -(WEEK_DAYS - 1));
  const to = shiftDateISO(today, 1); // exclusive end, so `today` is included
  const week = useStaffAttendanceMyHistoryQuery(from, to);

  const [scanned, setScanned] = useState<AttendanceRecord | null>(null);
  const [complete, setComplete] = useState(false);

  const weekDays = useMemo(() => [...(week.data?.data ?? [])].reverse(), [week.data]);
  const record = scanned ?? weekDays.find((day) => day.date === today) ?? null;

  // A minute-fresh live clock. formatTime only shows hours:minutes, so a
  // 10s tick keeps the display honest without re-rendering every second
  // for no visible change.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
    }, 10_000);
    return () => {
      clearInterval(id);
    };
  }, []);

  const hasArrival = Boolean(record?.arrival_at);
  const done = complete || Boolean(record?.departure_at);
  const time = (iso: string | null | undefined) =>
    iso ? formatTime(iso, { locale, timeZone }) : "-";
  const statusToken = record ? STATUS_TOKEN[record.status_code] : undefined;

  function handleScan() {
    scan.mutate(undefined, {
      onSuccess: (saved) => {
        setScanned(saved);
        toast.success(saved.departure_at ? t("departureSaved") : t("arrivalSaved"));
      },
      onError: (error) => {
        const code = error instanceof ApiError ? error.code : "UNKNOWN";
        if (code === "STAFF_ATTENDANCE_ALREADY_SCANNED") setComplete(true);
        toast.error(apiErrorMessage(code));
      },
    });
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      <section className="flex w-full max-w-md flex-col gap-5 rounded-sm border border-border bg-surface p-5">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-fg-muted">{t("today")}</p>
          <p className="text-[16px] font-medium">{formatDate(now, { locale, timeZone })}</p>
          <p
            className="text-[36px] font-semibold leading-none tabular-nums text-fg"
            aria-live="off"
          >
            {formatTime(now, { locale, timeZone })}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1 rounded-sm bg-bg p-3">
            <dt className="text-[12px] text-fg-muted">{t("arrival")}</dt>
            <dd className="text-[22px] font-medium tabular-nums">{time(record?.arrival_at)}</dd>
          </div>
          <div className="flex flex-col gap-1 rounded-sm bg-bg p-3">
            <dt className="text-[12px] text-fg-muted">{t("departure")}</dt>
            <dd className="text-[22px] font-medium tabular-nums">{time(record?.departure_at)}</dd>
          </div>
        </dl>

        {record && (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            {statusToken ? (
              <StatusBadge status={statusToken} label={tStatus(record.status_code)} />
            ) : (
              <span className="text-fg-muted">{tStatus(record.status_code)}</span>
            )}
            {record.late_minutes > 0 && (
              <span className="text-fg-muted">{t("lateBy", { minutes: record.late_minutes })}</span>
            )}
          </div>
        )}

        {done ? (
          <Alert
            title={t("doneTitle")}
            icon={<CheckCircle2 className="size-4 text-status-present" />}
          >
            <p>{t("doneBody")}</p>
          </Alert>
        ) : (
          <Button
            className="h-16 w-full text-[16px] font-semibold"
            icon={hasArrival ? <LogOut /> : <LogIn />}
            loading={scan.isPending}
            onClick={handleScan}
          >
            {hasArrival ? t("recordDeparture") : t("recordArrival")}
          </Button>
        )}

        <p className="text-[13px] text-fg-muted">{t("hint")}</p>
      </section>

      <section className="flex w-full max-w-md flex-col gap-2">
        <h2 className="text-[13px] font-medium text-fg">{t("thisWeek")}</h2>
        {week.isLoading ? (
          <Skeleton className="h-32 w-full" aria-busy="true" />
        ) : week.isError ? null : weekDays.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("thisWeekEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-sm border border-border bg-surface">
            {weekDays.map((day) => {
              const token = STATUS_TOKEN[day.status_code];
              const isToday = day.date === today;
              return (
                <li
                  key={day.date}
                  className={cn(
                    "flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]",
                    isToday && "bg-bg",
                  )}
                >
                  <div className="flex flex-col">
                    <span className={cn("text-fg", isToday && "font-medium")}>
                      {formatDate(new Date(`${day.date}T00:00:00`), {
                        locale,
                        timeZone,
                      })}
                    </span>
                    <span className="text-[12px] text-fg-muted tabular-nums">
                      {time(day.arrival_at)} - {time(day.departure_at)}
                    </span>
                  </div>
                  {token ? (
                    <StatusBadge status={token} label={tStatus(day.status_code)} />
                  ) : (
                    <span className="text-fg-muted">{tStatus(day.status_code)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
