"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDate, formatTime, type Locale } from "@newsekolah/i18n";
import { Alert, Button, PageHeader, StatusBadge, useToast, type StatusName } from "@newsekolah/ui";
import { CheckCircle2, LogIn, LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState, useSyncExternalStore } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { type AttendanceRecord, useScanStaffAttendanceMutation } from "../api";

const STATUS_TOKEN: Partial<Record<AttendanceRecord["status_code"], StatusName>> = {
  present: "present",
  late: "late",
  absent: "absent",
};

/**
 * The API has no "my record today" read for an employee without the board
 * permission, so the last scan result is remembered on this device. It is
 * only a hint for the button label; the server stays the source of truth
 * (a third scan is refused with STAFF_ATTENDANCE_ALREADY_SCANNED).
 */
function storageKey(userId: string, date: string): string {
  return `staff-check-in:${userId}:${date}`;
}

function readRaw(key: string): string | null {
  try {
    return key ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function parseRecord(raw: string | null): AttendanceRecord | null {
  try {
    return raw ? (JSON.parse(raw) as AttendanceRecord) : null;
  } catch {
    return null;
  }
}

// Nothing else writes this key, so there is nothing to subscribe to.
const noSubscribe = () => () => undefined;

function remember(key: string, record: AttendanceRecord): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(record));
  } catch {
    // Private mode or blocked storage: the label hint is simply lost.
  }
}

/** A teacher's or staff member's own arrival and departure, one tap each. */
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
  const key = me ? storageKey(me.id, today) : "";
  const rememberedRaw = useSyncExternalStore(
    noSubscribe,
    () => readRaw(key),
    () => null,
  );
  const remembered = useMemo(() => parseRecord(rememberedRaw), [rememberedRaw]);
  const [scanned, setScanned] = useState<AttendanceRecord | null>(null);
  const record = scanned ?? remembered;
  const [complete, setComplete] = useState(false);

  const hasArrival = Boolean(record?.arrival_at);
  const done = complete || Boolean(record?.departure_at);
  const time = (iso: string | null | undefined) =>
    iso ? formatTime(iso, { locale, timeZone }) : "-";
  const statusToken = record ? STATUS_TOKEN[record.status_code] : undefined;

  function handleScan() {
    scan.mutate(undefined, {
      onSuccess: (saved) => {
        setScanned(saved);
        if (key) remember(key, saved);
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
          <p className="text-[18px] font-medium">{formatDate(new Date(), { locale, timeZone })}</p>
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
            className="w-full"
            icon={hasArrival ? <LogOut /> : <LogIn />}
            loading={scan.isPending}
            onClick={handleScan}
          >
            {hasArrival ? t("recordDeparture") : t("recordArrival")}
          </Button>
        )}

        <p className="text-[13px] text-fg-muted">{t("hint")}</p>
      </section>
    </div>
  );
}
