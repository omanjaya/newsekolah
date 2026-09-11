"use client";

import type { components } from "@newsekolah/api-client";
import { DataTable, EmptyState, Input, PageHeader, Select, StatusBadge, cn } from "@newsekolah/ui";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { todayInZone, useHomeroomAttendanceQuery } from "../../attendance/api";

type Entry = components["schemas"]["AttendanceHomeroomEntry"];

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

const STATUS_FILTER_CODES = ["H", "S", "I", "D", "A", "INCOMPLETE"];

const PAGE_SIZE = 25;

/** Homeroom teacher's daily roster: one computed status per student, from the server. */
export function HomeroomView(): ReactElement {
  const t = useTranslations("app.homeroom");
  const { me } = useSession();
  const homeroom = me?.duties?.find((d) => d.slug === "homeroom");
  const [date, setDate] = useState(todayInZone(me?.tenant.timezone));
  const [search, setSearch] = useState("");
  const [statusCode, setStatusCode] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });

  const { data, isLoading } = useHomeroomAttendanceQuery(
    {
      date,
      search: search || undefined,
      statusCode: statusCode || undefined,
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
    },
    Boolean(homeroom),
  );

  const rows = data?.data ?? [];
  const isFiltered = search !== "" || statusCode !== "";

  const columns = useMemo<ColumnDef<Entry>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("columns.name"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-fg">{row.original.name}</span>
            {row.original.nis && (
              <span className="text-[12px] text-fg-muted">{row.original.nis}</span>
            )}
          </div>
        ),
      },
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
      {
        id: "guardian",
        header: t("columns.guardian"),
        enableSorting: false,
        cell: ({ row }) => {
          const { guardian_name, guardian_phone } = row.original;
          if (!guardian_name && !guardian_phone) {
            return <span className="text-fg-muted">{t("noGuardian")}</span>;
          }
          return (
            <div className="flex flex-col">
              {guardian_name && <span className="text-fg">{guardian_name}</span>}
              {guardian_phone && (
                <span className="text-[12px] text-fg-muted">{guardian_phone}</span>
              )}
            </div>
          );
        },
      },
      {
        id: "violations",
        header: t("columns.violations"),
        enableSorting: false,
        cell: ({ row }) => {
          const count = row.original.violation_count ?? 0;
          if (count === 0) return <span className="text-fg-muted">{t("noViolations")}</span>;
          return (
            <span className="text-fg">
              {t("violationSummary", { count, points: row.original.violation_points ?? 0 })}
            </span>
          );
        },
      },
    ],
    [t],
  );

  if (!homeroom) {
    return (
      <div className="p-4 md:p-6">
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
        <EmptyState
          icon={<UsersRound aria-hidden="true" />}
          title={t("noHomeroomTitle")}
          description={t("noHomeroomBody")}
          className="mt-6"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={
          homeroom.scope_label
            ? t("titleWithClass", { className: homeroom.scope_label })
            : t("title")
        }
        actions={
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) {
                setDate(e.target.value);
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }
            }}
            aria-label={t("dateLabel")}
            className="w-44"
          />
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("statusFilterLabel")}</span>
          <Select
            options={STATUS_FILTER_CODES.map((code) => ({
              value: code,
              label: t(`codes.${code}`),
            }))}
            value={statusCode}
            onValueChange={(value) => {
              setStatusCode(value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            placeholder={t("statusFilterAll")}
            aria-label={t("statusFilterLabel")}
            className="w-44"
          />
        </label>
        {statusCode !== "" && (
          <button
            type="button"
            className="text-[13px] text-accent underline underline-offset-2"
            onClick={() => {
              setStatusCode("");
            }}
          >
            {t("statusFilterClear")}
          </button>
        )}
      </div>
      <dl className="flex flex-wrap gap-4 text-[13px]">
        {Object.entries(data?.status_counts ?? {}).map(([code, count]) => (
          <div key={code} className="flex items-center gap-1">
            <dt className="text-fg-muted">{t(`codes.${code}`)}</dt>
            <dd className="font-medium text-fg">{count}</dd>
          </div>
        ))}
      </dl>
      <DataTable
        data={rows}
        columns={columns}
        rowCount={data?.total ?? 0}
        pagination={pagination}
        onPaginationChange={setPagination}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter={search}
        onGlobalFilterChange={(value) => {
          setSearch(value);
          setPagination((p) => ({ ...p, pageIndex: 0 }));
        }}
        isLoading={isLoading}
        getRowId={(r) => r.student_user_id}
        toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
        emptyState={
          <EmptyState
            icon={<UsersRound aria-hidden="true" />}
            title={isFiltered ? t("noMatchTitle") : t("emptyTitle")}
            description={isFiltered ? t("noMatchBody") : t("emptyBody")}
          />
        }
      />
    </div>
  );
}
