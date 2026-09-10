"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, FileBarChart } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import {
  useClassEnrollmentsQuery,
  useClassesQuery,
  useDirectoryQuery,
  type ClassRef,
} from "../../reference/api";
import {
  downloadDailyAttendanceReport,
  todayInZone,
  useDailyAttendanceReportQuery,
  useMonthlyAttendanceSummaryQuery,
  type CalendarDay,
  type RosterEntry,
} from "../api";

const STATUS_TOKEN: Record<
  string,
  "present" | "sick" | "excused" | "dispensation" | "absent" | "late"
> = {
  H: "present",
  S: "sick",
  I: "excused",
  D: "dispensation",
  A: "absent",
  INCOMPLETE: "late",
};

/**
 * The dedicated attendance report screen: renders the daily and monthly
 * reports on screen (docs/03-layered-architecture.md), unlike the report
 * centre (features/reports), which only offers a download.
 */
export function AttendanceReportsView(): ReactElement {
  const t = useTranslations("app.attendanceReports");
  const [tab, setTab] = useState("daily");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="daily">{t("tabs.daily")}</TabsTrigger>
          <TabsTrigger value="monthly">{t("tabs.monthly")}</TabsTrigger>
        </TabsList>
        <TabsContent value="daily" className="pt-4">
          <DailyReportTab />
        </TabsContent>
        <TabsContent value="monthly" className="pt-4">
          <MonthlyReportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function classOptions(classes: ClassRef[] | undefined) {
  return (classes ?? []).map((item) => ({ value: item.id, label: item.name }));
}

function DailyReportTab(): ReactElement {
  const t = useTranslations("app.attendanceReports.daily");
  const apiErrorMessage = useApiErrorMessage();
  const { me } = useSession();

  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayInZone(me?.tenant.timezone));
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const classes = useClassesQuery();
  const report = useDailyAttendanceReportQuery(date, classId, classId !== "");

  const rows = report.data?.students ?? [];

  const columns = useMemo<ColumnDef<RosterEntry>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name"), enableSorting: false },
      {
        accessorKey: "status_code",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => {
          const code = row.original.status_code;
          const token = STATUS_TOKEN[code];
          return token ? (
            <StatusBadge status={token} label={t(`codes.${code}`)} />
          ) : (
            <span className="text-fg-muted">{t(`codes.${code}`)}</span>
          );
        },
      },
      {
        id: "sessions",
        header: t("columns.sessions"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className={cn(!row.original.complete && "text-status-late")}>
            {row.original.submitted_sessions}/{row.original.expected_sessions}
          </span>
        ),
      },
    ],
    [t],
  );

  async function handleDownload() {
    setDownloadError(null);
    setDownloading(true);
    try {
      await downloadDailyAttendanceReport(date, classId);
    } catch (error) {
      setDownloadError(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("class")}</span>
          <Select
            options={classOptions(classes.data?.data)}
            value={classId}
            onValueChange={setClassId}
            placeholder={t("classPlaceholder")}
            disabled={classes.isLoading}
            aria-label={t("class")}
            className="w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("date")}</span>
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
            }}
            aria-label={t("date")}
            className="w-44"
          />
        </label>
        <Button
          size="sm"
          variant="secondary"
          disabled={classId === "" || date === ""}
          loading={downloading}
          onClick={() => void handleDownload()}
        >
          <Download className="size-4" aria-hidden="true" />
          {t("download")}
        </Button>
      </div>
      {downloadError && <p className="text-[13px] text-status-absent">{downloadError}</p>}

      {classId === "" ? (
        <EmptyState
          icon={<FileBarChart aria-hidden="true" />}
          title={t("pickClassTitle")}
          description={t("pickClassBody")}
        />
      ) : (
        <>
          {report.data && (
            <dl className="flex flex-wrap gap-4 text-[13px]">
              <div className="flex items-center gap-1">
                <dt className="text-fg-muted">{t("summarySubmitted")}</dt>
                <dd className="font-medium text-fg">
                  {report.data.submitted_sessions}/{report.data.expected_sessions}
                </dd>
              </div>
              {Object.entries(report.data.status_counts).map(([code, count]) => (
                <div key={code} className="flex items-center gap-1">
                  <dt className="text-fg-muted">{t(`codes.${code}`)}</dt>
                  <dd className="font-medium text-fg">{count}</dd>
                </div>
              ))}
            </dl>
          )}
          <DataTable
            data={rows}
            columns={columns}
            rowCount={rows.length}
            pagination={{ pageIndex: 0, pageSize: 50 }}
            onPaginationChange={() => undefined}
            sorting={[]}
            onSortingChange={() => undefined}
            globalFilter=""
            onGlobalFilterChange={() => undefined}
            isLoading={report.isLoading}
            getRowId={(r) => r.student_user_id}
            emptyState={
              <EmptyState icon={<FileBarChart aria-hidden="true" />} title={t("emptyTitle")} />
            }
          />
        </>
      )}
    </div>
  );
}

function MonthlyReportTab(): ReactElement {
  const t = useTranslations("app.attendanceReports.monthly");
  const { me } = useSession();

  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [month, setMonth] = useState(todayInZone(me?.tenant.timezone).slice(0, 7));

  const classes = useClassesQuery();
  const enrollments = useClassEnrollmentsQuery(classId, classId !== "");
  const students = useDirectoryQuery("student");
  const studentMap = useMemo(
    () => new Map((students.data?.data ?? []).map((s) => [s.id, s.name])),
    [students.data],
  );
  const studentOptions = useMemo(() => {
    const ids = new Set((enrollments.data?.data ?? []).map((e) => e.student_user_id));
    return [...ids]
      .map((id) => ({ value: id, label: studentMap.get(id) ?? id }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [enrollments.data, studentMap]);

  const report = useMonthlyAttendanceSummaryQuery(studentId, month, studentId !== "");

  const columns = useMemo<ColumnDef<CalendarDay>[]>(
    () => [
      { accessorKey: "date", header: t("columns.date"), enableSorting: false },
      {
        accessorKey: "status_code",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => {
          const code = row.original.status_code;
          const token = STATUS_TOKEN[code];
          return token ? (
            <StatusBadge status={token} label={t(`codes.${code}`)} />
          ) : (
            <span className="text-fg-muted">{t(`codes.${code}`)}</span>
          );
        },
      },
      {
        id: "sessions",
        header: t("columns.sessions"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className={cn(!row.original.complete && "text-status-late")}>
            {row.original.submitted_sessions}/{row.original.expected_sessions}
          </span>
        ),
      },
    ],
    [t],
  );

  const rows = (report.data?.data ?? []).filter((day) => day.status_code !== "NONE");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("class")}</span>
          <Select
            options={classOptions(classes.data?.data)}
            value={classId}
            onValueChange={(value) => {
              setClassId(value);
              setStudentId("");
            }}
            placeholder={t("classPlaceholder")}
            disabled={classes.isLoading}
            aria-label={t("class")}
            className="w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("student")}</span>
          <Select
            options={studentOptions}
            value={studentId}
            onValueChange={setStudentId}
            placeholder={t("studentPlaceholder")}
            disabled={classId === "" || enrollments.isLoading}
            aria-label={t("student")}
            className="w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("month")}</span>
          <Input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
            }}
            aria-label={t("month")}
            className="w-40"
          />
        </label>
      </div>

      {studentId === "" ? (
        <EmptyState
          icon={<FileBarChart aria-hidden="true" />}
          title={t("pickStudentTitle")}
          description={t("pickStudentBody")}
        />
      ) : (
        <>
          {report.data && (
            <dl className="flex flex-wrap gap-4 text-[13px]">
              {Object.entries(report.data.totals).map(([code, count]) => (
                <div key={code} className="flex items-center gap-1">
                  <dt className="text-fg-muted">{t(`codes.${code}`)}</dt>
                  <dd className="font-medium text-fg">{count}</dd>
                </div>
              ))}
            </dl>
          )}
          <DataTable
            data={rows}
            columns={columns}
            rowCount={rows.length}
            pagination={{ pageIndex: 0, pageSize: 31 }}
            onPaginationChange={() => undefined}
            sorting={[]}
            onSortingChange={() => undefined}
            globalFilter=""
            onGlobalFilterChange={() => undefined}
            isLoading={report.isLoading}
            getRowId={(r) => r.date}
            emptyState={
              <EmptyState icon={<FileBarChart aria-hidden="true" />} title={t("emptyTitle")} />
            }
          />
        </>
      )}
    </div>
  );
}
