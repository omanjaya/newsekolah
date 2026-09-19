"use client";

import { DataTable, EmptyState, PageHeader, Skeleton, domainIcons } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo } from "react";

import { QueryError } from "../../../components/query-error";
import { useLookup, useTeachersQuery } from "../../reference/api";
import { useScheduledObservationsQuery, useSupervisionCycleQuery } from "../api";

interface TeacherRow {
  teacherUserId: string;
  scheduledCount: number;
}

/**
 * The cycle-wide view: every teacher this cycle has scheduled an
 * observation for, linking into each one's own report. There is no
 * separate cycle-aggregate endpoint; this is built from the same scheduled
 * list the cycle detail page already shows.
 */
export function SupervisionCycleReportView({ cycleId }: { cycleId: string }): ReactElement {
  const t = useTranslations("app.supervision.cycleReport");
  const router = useRouter();

  const cycle = useSupervisionCycleQuery(cycleId);
  const scheduled = useScheduledObservationsQuery(cycleId);
  const teachers = useTeachersQuery();
  const teacherMap = useLookup(teachers.data?.data);

  const rows = useMemo<TeacherRow[]>(() => {
    const counts = new Map<string, number>();
    for (const s of scheduled.data?.data ?? []) {
      counts.set(s.teacher_user_id, (counts.get(s.teacher_user_id) ?? 0) + 1);
    }
    return [...counts.entries()].map(([teacherUserId, scheduledCount]) => ({
      teacherUserId,
      scheduledCount,
    }));
  }, [scheduled.data]);

  const columns = useMemo<ColumnDef<TeacherRow>[]>(
    () => [
      {
        id: "teacher",
        header: t("columns.teacher"),
        enableSorting: false,
        cell: ({ row }) => teacherMap.get(row.original.teacherUserId)?.name ?? t("unknownTeacher"),
      },
      {
        id: "scheduledCount",
        header: t("columns.scheduledCount"),
        enableSorting: false,
        cell: ({ row }) => row.original.scheduledCount,
      },
    ],
    [t, teacherMap],
  );

  if (cycle.isError && !cycle.data)
    return <QueryError retry={() => cycle.refetch()} className="m-4" />;

  if (cycle.isLoading || !cycle.data) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title", { cycle: cycle.data.name })} />

      <DataTable
        stateKey="features/supervision/components/supervision-cycle-report-view:1"
        mode="local"
        searchable={false}
        data={rows}
        columns={columns}
        rowCount={rows.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        isLoading={scheduled.isLoading}
        getRowId={(item) => item.teacherUserId}
        onRowActivate={(item) => {
          router.push(`/supervision/cycles/${cycleId}/teachers/${item.teacherUserId}/report`);
        }}
        emptyState={
          <EmptyState
            icon={<domainIcons.supervision aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />
    </div>
  );
}
