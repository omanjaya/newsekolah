"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatTime, type Locale } from "@newsekolah/i18n";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  Skeleton,
  StatusBadge,
  useToast,
  type StatusName,
} from "@newsekolah/ui";
import { LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../../components/query-error";
import { useApiErrorMessage } from "../../../../lib/i18n/api-error-message";
import { todayInZone } from "../../../../lib/tenant-date";
import {
  type AttendanceRecord,
  useScanStaffAttendanceMutation,
  useStaffAttendanceMyHistoryQuery,
} from "../../../staff-attendance/api";
import { shiftDateISO } from "../../../staff-attendance/time";
import { EMPTY_BLOCK, type Me, type PersonaBlock } from "../types";

const CHECK_IN_HREF = "/check-in";

const STATUS_TOKEN: Partial<Record<AttendanceRecord["status_code"], StatusName>> = {
  present: "present",
  late: "late",
  absent: "absent",
};

/**
 * The teacher's or staff member's own arrival and departure for today. The
 * `/check-in` flow is a single server-timestamped tap (no location or
 * selfie step), so the card performs it through the same scan mutation
 * rather than only linking out.
 */
export function useCheckInBlock(me: Me, active: boolean): PersonaBlock {
  const today = todayInZone(me.tenant.timezone);
  // The history query is only enabled for a non-empty range, so an empty
  // range keeps it idle while the persona is inactive.
  const history = useStaffAttendanceMyHistoryQuery(
    active ? today : "",
    active ? shiftDateISO(today, 1) : "",
  );
  const scan = useScanStaffAttendanceMutation();

  if (!active) return EMPTY_BLOCK;

  return {
    tiles: [],
    left: [
      {
        key: "checkIn.card",
        node: (
          <CheckInCard
            key="checkIn.card"
            today={today}
            timeZone={me.tenant.timezone}
            isLoading={history.isLoading}
            isError={history.isError}
            refetch={history.refetch}
            record={history.data?.data.find((day) => day.date === today) ?? null}
            scan={scan}
          />
        ),
      },
    ],
    right: [],
  };
}

function CheckInCard({
  today,
  timeZone,
  isLoading,
  isError,
  refetch,
  record,
  scan,
}: {
  today: string;
  timeZone: string;
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
  record: AttendanceRecord | null;
  scan: ReturnType<typeof useScanStaffAttendanceMutation>;
}): ReactElement {
  const t = useTranslations("app.dashboardDuty.checkIn");
  const tSelf = useTranslations("app.staffAttendance.self");
  const tStatus = useTranslations("app.staffAttendance.statuses");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const [scanned, setScanned] = useState<AttendanceRecord | null>(null);
  const [completeDate, setCompleteDate] = useState<string | null>(null);

  const current = (scanned?.date === today ? scanned : null) ?? record;
  const hasArrival = Boolean(current?.arrival_at);
  const done = completeDate === today || Boolean(current?.departure_at);
  const time = (iso: string | null | undefined) =>
    iso ? formatTime(iso, { locale, timeZone }) : "-";
  const statusToken = current ? STATUS_TOKEN[current.status_code] : undefined;

  function handleScan() {
    scan.mutate(undefined, {
      onSuccess: (saved) => {
        setScanned(saved);
        toast.success(saved.departure_at ? tSelf("departureSaved") : tSelf("arrivalSaved"));
      },
      onError: (error) => {
        const code = error instanceof ApiError ? error.code : "UNKNOWN";
        if (code === "STAFF_ATTENDANCE_ALREADY_SCANNED") setCompleteDate(today);
        toast.error(apiErrorMessage(code));
      },
    });
  }

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>{t("title")}</CardTitle>
        <Link
          href={CHECK_IN_HREF}
          className="shrink-0 text-[13px] text-accent underline underline-offset-2"
        >
          {t("openPage")}
        </Link>
      </CardHeader>
      <div className="flex flex-col gap-4 px-5 pb-5">
        {isError ? (
          <QueryError retry={refetch} />
        ) : isLoading ? (
          <Skeleton className="h-24 w-full" aria-busy="true" />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1 rounded-sm bg-bg p-3">
                <dt className="text-[12px] text-fg-muted">{tSelf("arrival")}</dt>
                <dd className="text-[18px] font-medium tabular-nums">
                  {time(current?.arrival_at)}
                </dd>
              </div>
              <div className="flex flex-col gap-1 rounded-sm bg-bg p-3">
                <dt className="text-[12px] text-fg-muted">{tSelf("departure")}</dt>
                <dd className="text-[18px] font-medium tabular-nums">
                  {time(current?.departure_at)}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              {current ? (
                statusToken ? (
                  <StatusBadge status={statusToken} label={tStatus(current.status_code)} />
                ) : (
                  <span className="text-fg-muted">{tStatus(current.status_code)}</span>
                )
              ) : (
                <span className="text-fg-muted">{t("notYet")}</span>
              )}
              {current && current.late_minutes > 0 && (
                <span className="text-fg-muted">
                  {tSelf("lateBy", { minutes: current.late_minutes })}
                </span>
              )}
            </div>
            {done ? (
              <p className="text-[13px] text-fg-muted">{t("done")}</p>
            ) : (
              <Button
                className="w-full"
                icon={hasArrival ? <LogOut /> : <LogIn />}
                loading={scan.isPending}
                onClick={handleScan}
              >
                {hasArrival ? t("checkOut") : t("checkIn")}
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
