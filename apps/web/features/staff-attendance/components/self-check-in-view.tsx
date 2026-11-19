"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatTime, type Locale } from "@newsekolah/i18n";
import {
  Alert,
  Badge,
  Button,
  Card,
  List,
  ListRow,
  SectionHeader,
  SkeletonList,
  Stat,
  StatGrid,
  StatusBadge,
  TextLink,
  useToast,
  type StatusName,
} from "@newsekolah/ui";
import { Fingerprint, LogIn, LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { useBusinessNow } from "../../../lib/simulation/clock";
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

/** A day's status as one pill: the attendance colours where they apply, quiet otherwise. */
function DayStatus({ status, label }: { status: AttendanceRecord["status_code"]; label: string }) {
  const token = STATUS_TOKEN[status];
  return token ? <StatusBadge status={token} label={label} /> : <Badge>{label}</Badge>;
}

/**
 * A teacher's or staff member's own arrival and departure, one tap each:
 * today's date and a large school clock, what is recorded so far, and the
 * one action, full width and low on a phone screen. "Today" and "this
 * week" both come from `useStaffAttendanceMyHistoryQuery` (self-service, no
 * `view_staff_attendance` permission needed); the screen shows the scan
 * result at once while the refetch is in flight.
 */
export function SelfCheckInView(): ReactElement {
  const now = useBusinessNow();
  const t = useTranslations("app.staffAttendance.self");
  const tStatus = useTranslations("app.staffAttendance.statuses");
  const tArea = useTranslations("app.staffAttendance");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const scan = useScanStaffAttendanceMutation();
  const canEditSchedules = useCan("manage_staff_attendance_schedules");
  const canViewBoard = useCan("view_staff_attendance");

  const today = todayInZone(timeZone);
  const from = shiftDateISO(today, -(WEEK_DAYS - 1));
  const to = shiftDateISO(today, 1); // exclusive end, so `today` is included
  const week = useStaffAttendanceMyHistoryQuery(from, to);

  const [scanned, setScanned] = useState<AttendanceRecord | null>(null);
  const [completeDate, setCompleteDate] = useState<string | null>(null);

  const weekDays = useMemo(() => [...(week.data?.data ?? [])].reverse(), [week.data]);
  const record =
    (scanned?.date === today ? scanned : null) ??
    weekDays.find((day) => day.date === today) ??
    null;

  const hasArrival = Boolean(record?.arrival_at);
  const done = completeDate === today || Boolean(record?.departure_at);
  const time = (iso: string | null | undefined) =>
    iso ? formatTime(iso, { locale, timeZone }) : "–";
  const dayFormat = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const dayLabel = (day: AttendanceRecord) =>
    day.status_code === "holiday" && day.holiday_name
      ? t("holidayWithName", { name: day.holiday_name })
      : tStatus(day.status_code);
  // "unscheduled" (no weekly schedule configured at all) and "holiday" (a
  // genuine day off, named when the calendar says why) look the same --
  // "nothing recorded" -- but must never be presented the same way: one is
  // a setup gap the person should not be blocked by, the other is a real
  // day off the primary action is de-emphasised for. See
  // ComputeLateness's doc comment (apps/api) for why the two are kept
  // distinct all the way from the domain layer up to here.
  const holiday = record?.status_code === "holiday";
  // The hint below states the unscheduled day once, so the pill and the row
  // badges stay quiet for it.
  const unscheduledToday = record?.status_code === "unscheduled";

  function handleScan() {
    scan.mutate(undefined, {
      onSuccess: (saved) => {
        setScanned(saved);
        toast.success(saved.departure_at ? t("departureSaved") : t("arrivalSaved"));
      },
      onError: (error) => {
        const code = error instanceof ApiError ? error.code : "UNKNOWN";
        if (code === "STAFF_ATTENDANCE_ALREADY_SCANNED") setCompleteDate(today);
        toast.error(apiErrorMessage(code));
      },
    });
  }

  return (
    // The school-wide board is a header link, as the board links back here:
    // it has a tab row of its own, so a shared tab strip above both would
    // vanish on one of them. Each link carries its destination's icon.
    <AppPage
      variant="narrow"
      secondaryActions={
        canViewBoard
          ? [
              {
                label: tArea("navLabel"),
                icon: <Fingerprint />,
                href: "/staff-attendance",
                showOnPhone: true,
              },
            ]
          : []
      }
    >
      <Card padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-body text-fg-muted">{formatDayOf(now, locale, timeZone)}</p>
            <p className="text-kiosk-display text-fg" aria-live="off">
              {formatTime(now, { locale, timeZone })}
            </p>
          </div>
          {record && !unscheduledToday && (
            <DayStatus status={record.status_code} label={dayLabel(record)} />
          )}
        </div>

        <StatGrid className="grid-cols-2 gap-4">
          <Stat
            icon={<LogIn />}
            tone="green"
            label={t("arrival")}
            value={<span className="tabular-nums">{time(record?.arrival_at)}</span>}
            hint={
              record && record.late_minutes > 0
                ? t("lateBy", { minutes: record.late_minutes })
                : undefined
            }
          />
          <Stat
            icon={<LogOut />}
            tone="blue"
            label={t("departure")}
            value={<span className="tabular-nums">{time(record?.departure_at)}</span>}
          />
        </StatGrid>

        {unscheduledToday && (
          <Alert tone="warning">
            {canEditSchedules ? (
              <>
                {t("unscheduledHintManage")}{" "}
                <TextLink href="/staff-attendance?tab=schedule">{t("openSchedule")}</TextLink>
              </>
            ) : (
              t("unscheduledHint")
            )}
          </Alert>
        )}
        {holiday && <Alert tone="info">{t("holidayHint")}</Alert>}

        {done ? (
          <Alert tone="success" title={t("doneTitle")}>
            {t("doneBody")}
          </Alert>
        ) : (
          <Button
            size="lg"
            className="w-full"
            variant={holiday ? "secondary" : "primary"}
            icon={hasArrival ? <LogOut /> : <LogIn />}
            loading={scan.isPending}
            onClick={handleScan}
          >
            {hasArrival ? t("recordDeparture") : t("recordArrival")}
          </Button>
        )}

        <p className="text-body-sm text-fg-muted">{t("hint")}</p>
      </Card>

      <section className="flex flex-col gap-3">
        <SectionHeader title={t("thisWeek")} />
        {week.isLoading ? (
          <SkeletonList rows={WEEK_DAYS} leading={false} />
        ) : week.isError ? (
          <QueryError retry={() => week.refetch()} error={week.error} />
        ) : weekDays.length === 0 ? (
          <p className="text-body-sm text-fg-muted">{t("thisWeekEmpty")}</p>
        ) : (
          <List framed aria-label={t("thisWeek")}>
            {weekDays.map((day) => (
              <ListRow
                key={day.date}
                selected={day.date === today}
                title={dayFormat.format(new Date(`${day.date}T12:00:00Z`))}
                meta={
                  day.arrival_at || day.departure_at ? (
                    <span className="tabular-nums">
                      {t("hoursRange", {
                        arrival: time(day.arrival_at),
                        departure: time(day.departure_at),
                      })}
                    </span>
                  ) : (
                    t("noRecord")
                  )
                }
                trailing={
                  day.status_code === "unscheduled" ? undefined : (
                    <DayStatus status={day.status_code} label={dayLabel(day)} />
                  )
                }
              />
            ))}
          </List>
        )}
      </section>
    </AppPage>
  );
}

/** "Sabtu, 14 November 2026" on the school's calendar. */
function formatDayOf(instant: Date, locale: Locale, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(instant);
}
