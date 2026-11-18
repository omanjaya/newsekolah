"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatTime, type Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataList,
  DataListItem,
  Skeleton,
  StatusBadge,
  TextLink,
  useToast,
  type StatusName,
} from "@newsekolah/ui";
import { LogIn, LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../../components/query-error";
import { useApiErrorMessage } from "../../../../lib/i18n/api-error-message";
import { isModuleEnabled } from "../../../../lib/modules/feature-modules";
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
  const attendanceOn = isModuleEnabled(me, "staff_attendance");
  const live = active && attendanceOn;
  const history = useStaffAttendanceMyHistoryQuery(
    live ? today : "",
    live ? shiftDateISO(today, 1) : "",
  );
  const scan = useScanStaffAttendanceMutation();

  if (!live) return EMPTY_BLOCK;

  return {
    tiles: [],
    main: [],
    side: [
      {
        key: "checkIn.card",
        node: (
          <CheckInCard
            key="checkIn.card"
            today={today}
            timeZone={me.tenant.timezone}
            isLoading={history.isLoading}
            isError={history.isError}
            error={history.error}
            refetch={history.refetch}
            record={history.data?.data.find((day) => day.date === today) ?? null}
            scan={scan}
          />
        ),
      },
    ],
  };
}

function CheckInCard({
  today,
  timeZone,
  isLoading,
  isError,
  error,
  refetch,
  record,
  scan,
}: {
  today: string;
  timeZone: string;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
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
    iso ? formatTime(iso, { locale, timeZone }) : "–";
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
    <Card>
      <CardHeader action={<TextLink href={CHECK_IN_HREF}>{t("openPage")}</TextLink>}>
        <CardTitle as="h2">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isError ? (
          <QueryError retry={refetch} error={error} />
        ) : isLoading ? (
          <Skeleton className="h-28 w-full" aria-busy="true" />
        ) : hasArrival ? (
          <>
            <DataList layout="stacked" columns={2} className="grid-cols-2">
              <DataListItem label={tSelf("arrival")}>
                <span className="text-heading tabular-nums">{time(current?.arrival_at)}</span>
              </DataListItem>
              <DataListItem label={tSelf("departure")}>
                <span className="text-heading tabular-nums">{time(current?.departure_at)}</span>
              </DataListItem>
            </DataList>
            <div className="flex flex-wrap items-center gap-2">
              {current &&
                (statusToken ? (
                  <StatusBadge status={statusToken} label={tStatus(current.status_code)} />
                ) : (
                  <Badge>{tStatus(current.status_code)}</Badge>
                ))}
              {current && current.late_minutes > 0 && (
                <span className="text-body-sm text-fg-muted">
                  {tSelf("lateBy", { minutes: current.late_minutes })}
                </span>
              )}
            </div>
            {done ? (
              <p className="text-body-sm text-fg-muted">{t("done")}</p>
            ) : (
              // Secondary on the home: the hero holds the page's one primary
              // action. The /check-in page itself keeps a primary button.
              <Button
                variant="secondary"
                className="w-full"
                icon={<LogOut />}
                loading={scan.isPending}
                onClick={handleScan}
              >
                {t("checkOut")}
              </Button>
            )}
          </>
        ) : (
          // Before the first tap there are no times to show: one row with
          // the day's state and the button, instead of two dashes and a
          // grey pill that lead every staff home on a phone while a school
          // has not set work schedules yet.
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <p className="text-body-sm text-fg-muted" data-testid="check-in-state">
              {done ? t("done") : current ? tStatus(current.status_code) : t("notYet")}
            </p>
            {!done && (
              <Button
                variant="secondary"
                size="sm"
                className="max-sm:w-full"
                icon={<LogIn />}
                loading={scan.isPending}
                onClick={handleScan}
              >
                {t("checkIn")}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
