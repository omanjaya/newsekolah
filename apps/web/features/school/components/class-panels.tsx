"use client";

import {
  Avatar,
  Button,
  DataTable,
  EmptyState,
  RowActionsMenu,
  domainIcons,
  selectionColumn,
  type DataTableProps,
} from "@newsekolah/ui";
import type { RowSelectionState } from "@tanstack/react-table";
import { ArrowRightLeft, Plus, UserMinus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { formatCalendarDate } from "../../../lib/format-calendar-date";
import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryNames } from "../../reference/directory-names";
import { StudentLink } from "../../students/components/student-link";
import { useEnrollmentsQuery } from "../api";

import {
  AssignStudentsDialog,
  LeaveStudentsDialog,
  MoveStudentsDialog,
  type RosterStudent,
} from "./class-enrollment-dialogs";

type RosterColumns = DataTableProps<RosterStudent>["columns"];

/**
 * The class roster as a table: number, name (a link to the profile), NIS
 * and the date the student joined. Rows can be ticked to move or close
 * several enrollments at once; each row keeps its own menu.
 */
export function EnrollmentPanel({
  classId,
  canManage,
}: {
  classId: string;
  canManage: boolean;
}): ReactElement {
  const t = useTranslations("app.school.classes");
  const format = useFormatter();
  const enrollments = useEnrollmentsQuery(classId);
  // Moving and leaving both close an enrollment, which the API gates on
  // manage_enrollments rather than the master-data permission behind `canManage`.
  const canManageEnrollments = useCan("manage_enrollments");
  const canChangeEnrollment = canManage && canManageEnrollments;
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<RosterStudent[]>([]);
  const [leaving, setLeaving] = useState<RosterStudent[]>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const active = useMemo(
    () => (enrollments.data?.data ?? []).filter((e) => e.status === "active"),
    [enrollments.data],
  );
  const names = useDirectoryNames(
    active.filter((e) => !e.student_name).map((e) => e.student_user_id),
  );
  const rows = useMemo<RosterStudent[]>(
    () =>
      active.map((enrollment) => ({
        enrollment,
        name:
          enrollment.student_name ??
          names.get(enrollment.student_user_id)?.name ??
          enrollment.student_user_id,
      })),
    [active, names],
  );
  const selected = rows.filter((row) => rowSelection[row.enrollment.id]);

  const columns = useMemo<RosterColumns>(() => {
    const list: RosterColumns = [
      {
        id: "number",
        header: t("columns.number"),
        enableSorting: false,
        enableHiding: false,
        size: 48,
        meta: { card: "hidden", align: "end" },
        cell: ({ row }) => <span className="text-fg-muted tabular-nums">{row.index + 1}</span>,
      },
      {
        id: "name",
        accessorFn: (row) => `${row.name} ${row.enrollment.student_nis ?? ""}`,
        header: t("columns.name"),
        meta: { card: "title", skeleton: "avatar", label: t("columns.name") },
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar size={32} name={row.original.name} decorative />
            <span className="truncate font-medium text-fg">
              <StudentLink studentId={row.original.enrollment.student_user_id}>
                {row.original.name}
              </StudentLink>
            </span>
          </div>
        ),
      },
      {
        id: "nis",
        accessorFn: (row) => row.enrollment.student_nis ?? "",
        header: t("columns.nis"),
        meta: { card: "subtitle" },
        cell: ({ getValue }) => (
          <span className="tabular-nums">{(getValue() as string) || "-"}</span>
        ),
      },
      {
        id: "joined",
        accessorFn: (row) => row.enrollment.joined_on,
        header: t("columns.joined"),
        meta: { card: "meta" },
        cell: ({ row }) => formatCalendarDate(format, row.original.enrollment.joined_on),
      },
    ];
    if (!canChangeEnrollment) return list;
    return [
      selectionColumn<RosterStudent>(),
      ...list,
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <RowActionsMenu
            ariaLabel={t("rowActionsMenu", { name: row.original.name })}
            items={[
              {
                label: t("moveStudent"),
                icon: <ArrowRightLeft />,
                onClick: () => {
                  setMoving([row.original]);
                },
              },
              {
                label: t("leaveStudent"),
                icon: <UserMinus />,
                tone: "danger",
                onClick: () => {
                  setLeaving([row.original]);
                },
              },
            ]}
          />
        ),
      },
    ];
  }, [canChangeEnrollment, format, t]);

  const assignButton = canManage ? (
    <Button
      variant="secondary"
      icon={<Plus />}
      onClick={() => {
        setAdding(true);
      }}
    >
      {t("assignStudents")}
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col md:min-h-0 md:flex-1">
      <DataTable
        mode="local"
        stateKey={`features/school/components/class-panels:${classId}`}
        data={rows}
        columns={columns}
        getRowId={(row) => row.enrollment.id}
        isLoading={enrollments.isLoading}
        error={enrollments.error ?? enrollments.isError}
        onRetry={() => void enrollments.refetch()}
        retrying={enrollments.isRefetching}
        toolbarLabels={{ searchPlaceholder: t("searchStudent") }}
        toolbarActions={assignButton}
        rowSelection={canChangeEnrollment ? rowSelection : undefined}
        onRowSelectionChange={canChangeEnrollment ? setRowSelection : undefined}
        bulkActions={
          <>
            <Button
              size="sm"
              variant="secondary"
              icon={<ArrowRightLeft />}
              onClick={() => {
                setMoving(selected);
              }}
            >
              {t("moveSelected")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<UserMinus />}
              onClick={() => {
                setLeaving(selected);
              }}
            >
              {t("leaveSelected")}
            </Button>
          </>
        }
        fillHeight
        emptyState={
          <EmptyState
            icon={<domainIcons.users aria-hidden="true" />}
            title={t("noStudents")}
            description={canManage ? t("noStudentsBody") : undefined}
            action={assignButton}
          />
        }
      />
      <AssignStudentsDialog classId={classId} open={adding} onOpenChange={setAdding} />
      <MoveStudentsDialog
        classId={classId}
        students={moving}
        onClose={() => {
          setMoving([]);
        }}
        onDone={() => {
          setMoving([]);
          setRowSelection({});
        }}
      />
      <LeaveStudentsDialog
        classId={classId}
        students={leaving}
        onClose={() => {
          setLeaving([]);
        }}
        onDone={() => {
          setLeaving([]);
          setRowSelection({});
        }}
      />
    </div>
  );
}
// TeachingPanel lives in ./teaching-panel.tsx to keep this file under the
// project's line limit; see api.ts for the same split pattern.
