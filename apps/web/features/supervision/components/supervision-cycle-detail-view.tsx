"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  PageHeader,
  Skeleton,
  domainIcons,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useCan } from "../../../lib/session/session-provider";
import { useLookup, useTeachersQuery } from "../../reference/api";
import {
  type ScheduledObservation,
  useScheduledObservationsQuery,
  useSupervisionCycleQuery,
} from "../api";

import { CompleteObservationForm } from "./complete-observation-form";
import { ScheduleObservationForm } from "./schedule-observation-form";

export function SupervisionCycleDetailView({ cycleId }: { cycleId: string }): ReactElement {
  const t = useTranslations("app.supervision.cycleDetail");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canManage = useCan("manage_supervision");

  const cycle = useSupervisionCycleQuery(cycleId);
  const scheduled = useScheduledObservationsQuery(cycleId);
  const teachers = useTeachersQuery();
  const teacherMap = useLookup(teachers.data?.data);

  const [scheduling, setScheduling] = useState(false);
  const [completing, setCompleting] = useState<ScheduledObservation | null>(null);

  const items = scheduled.data?.data ?? [];

  const columns = useMemo<ColumnDef<ScheduledObservation>[]>(
    () => [
      {
        id: "lessonDate",
        header: t("columns.lessonDate"),
        enableSorting: false,
        cell: ({ row }) => formatDate(row.original.lesson_date, { locale }),
      },
      {
        id: "teacher",
        header: t("columns.teacher"),
        enableSorting: false,
        cell: ({ row }) =>
          teacherMap.get(row.original.teacher_user_id)?.name ?? t("unknownTeacher"),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) =>
          canManage && cycle.data ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setCompleting(row.original);
              }}
            >
              {t("complete")}
            </Button>
          ) : null,
      },
    ],
    [t, locale, teacherMap, canManage, cycle.data],
  );

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
      <PageHeader
        eyebrow={t("eyebrow")}
        title={cycle.data.name}
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                router.push(`/supervision/cycles/${cycleId}/report`);
              }}
            >
              {t("viewReport")}
            </Button>
            {canManage && (
              <Button
                size="sm"
                icon={<Plus />}
                onClick={() => {
                  setScheduling(true);
                }}
              >
                {t("schedule")}
              </Button>
            )}
          </div>
        }
      />

      <DataTable
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        onGlobalFilterChange={() => undefined}
        isLoading={scheduled.isLoading}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState
            icon={<domainIcons.supervision aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />

      <Dialog
        open={scheduling}
        onOpenChange={(open) => {
          setScheduling(open);
        }}
      >
        <DialogContent title={t("scheduleTitle")} className="max-w-lg">
          <ScheduleObservationForm
            cycleId={cycleId}
            onDone={() => {
              setScheduling(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={completing !== null}
        onOpenChange={(open) => {
          if (!open) setCompleting(null);
        }}
      >
        <DialogContent title={t("completeTitle")} className="max-w-lg">
          {completing && (
            <CompleteObservationForm
              scheduled={completing}
              instrument={cycle.data.instrument}
              onDone={() => {
                setCompleting(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
