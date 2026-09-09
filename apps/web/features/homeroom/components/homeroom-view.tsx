"use client";

import type { components } from "@newsekolah/api-client";
import { DataTable, EmptyState, Input, PageHeader, StatusBadge, cn } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { todayInZone, useHomeroomAttendanceQuery } from "../../attendance/api";

type Entry = components["schemas"]["AttendanceRosterEntry"];

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

/** Homeroom teacher's daily roster: one computed status per student. */
export function HomeroomView(): ReactElement {
  const t = useTranslations("app.homeroom");
  const { me } = useSession();
  const homeroom = me?.duties?.find((d) => d.slug === "homeroom");
  const [date, setDate] = useState(todayInZone(me?.tenant.timezone));
  const [filter, setFilter] = useState("");
  const { data, isLoading } = useHomeroomAttendanceQuery(date, Boolean(homeroom));

  const rows = useMemo(() => {
    const items = data?.data ?? [];
    const q = filter.trim().toLowerCase();
    return q ? items.filter((r) => r.name.toLowerCase().includes(q)) : items;
  }, [data, filter]);

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of data?.data ?? []) counts[r.status_code] = (counts[r.status_code] ?? 0) + 1;
    return counts;
  }, [data]);

  const columns = useMemo<ColumnDef<Entry>[]>(
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
              setDate(e.target.value);
            }}
            aria-label={t("dateLabel")}
            className="w-44"
          />
        }
      />
      <dl className="flex flex-wrap gap-4 text-[13px]">
        {Object.entries(summary).map(([code, count]) => (
          <div key={code} className="flex items-center gap-1">
            <dt className="text-fg-muted">{t(`codes.${code}`)}</dt>
            <dd className="font-medium text-fg">{count}</dd>
          </div>
        ))}
      </dl>
      <DataTable
        data={rows}
        columns={columns}
        rowCount={rows.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter={filter}
        onGlobalFilterChange={setFilter}
        isLoading={isLoading}
        getRowId={(r) => r.student_user_id}
        emptyState={
          <EmptyState
            icon={<UsersRound aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />
    </div>
  );
}
