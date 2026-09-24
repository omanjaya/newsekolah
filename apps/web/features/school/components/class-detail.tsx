"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from "@newsekolah/ui";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDeleteClassMutation } from "../../academic/api-school-extras";
import { useLookup, useTeachersQuery } from "../../reference/api";
import { type ClassRow, useEnrollmentsQuery, useTeachingAssignmentsQuery } from "../api";

import { ClassForm } from "./class-form";
import { EnrollmentPanel } from "./class-panels";
import { ClassRosterExport } from "./class-roster-export";
import { TeachingPanel } from "./teaching-panel";

export const CLASS_TABS = ["students", "teachers"] as const;

/** The selected class's header (name, roster count, homeroom, actions) and its students/teachers tabs. */
export function ClassDetail({
  cls,
  canManage,
  tab,
  onTabChange,
}: {
  cls: ClassRow;
  canManage: boolean;
  tab: (typeof CLASS_TABS)[number];
  onTabChange: (tab: (typeof CLASS_TABS)[number]) => void;
}): ReactElement {
  const t = useTranslations("app.school.classes");
  const year = useActiveYear();
  const teachers = useTeachersQuery();
  const teacherMap = useLookup(teachers.data?.data);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useDeleteClassMutation();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  // Shared with EnrollmentPanel/TeachingPanel below; React Query dedupes the
  // request so the header counts cost nothing extra over the panels' own.
  const enrollments = useEnrollmentsQuery(cls.id);
  const teachingAssignments = useTeachingAssignmentsQuery(cls.id);
  const activeEnrollmentCount = useMemo(
    () => (enrollments.data?.data ?? []).filter((e) => e.status === "active").length,
    [enrollments.data],
  );
  const activeTeachingCount = useMemo(
    () => (teachingAssignments.data?.data ?? []).filter((a) => a.is_active).length,
    [teachingAssignments.data],
  );
  const homeroomTeacher = cls.homeroom_teacher_id
    ? teacherMap.get(cls.homeroom_teacher_id)
    : undefined;
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-sm border border-border bg-surface p-4 md:min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[18px] font-medium text-fg">{cls.name}</h2>
            {enrollments.data && (
              <Badge variant="neutral" className="tabular-nums">
                {cls.capacity
                  ? t("rosterOfCapacity", { n: activeEnrollmentCount, max: cls.capacity })
                  : t("studentCount", { n: activeEnrollmentCount })}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-[13px] text-fg-muted">
            <span>{t("homeroomLabel")}:</span>
            {homeroomTeacher ? (
              <span className="flex items-center gap-2">
                <Avatar size="sm" name={homeroomTeacher.name} />
                {homeroomTeacher.name}
              </span>
            ) : (
              <span>{t("noHomeroom")}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <ClassRosterExport classId={cls.id} />
          {canManage && (
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={<Pencil />}
                onClick={() => {
                  setEditing(true);
                }}
              >
                {t("editClass")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Trash2 />}
                onClick={() => {
                  setDeleting(true);
                }}
              >
                {t("deleteClass")}
              </Button>
            </>
          )}
        </div>
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          onTabChange(value as (typeof CLASS_TABS)[number]);
        }}
        className="flex flex-col md:min-h-0 md:flex-1"
      >
        <TabsList>
          <TabsTrigger value="students">
            {t("tabStudents")}
            {enrollments.data && (
              <span className="ml-1 tabular-nums text-fg-muted">({activeEnrollmentCount})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="teachers">
            {t("tabTeachers")}
            {teachingAssignments.data && (
              <span className="ml-1 tabular-nums text-fg-muted">({activeTeachingCount})</span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="students" className="pt-3 md:min-h-0 md:flex-1">
          <EnrollmentPanel classId={cls.id} canManage={canManage} />
        </TabsContent>
        <TabsContent value="teachers" className="pt-3 md:min-h-0 md:flex-1">
          <TeachingPanel classId={cls.id} canManage={canManage} />
        </TabsContent>
      </Tabs>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t("deleteClass")}
        description={t("deleteClassBody", { name: cls.name })}
        confirmLabel={t("deleteClass")}
        destructive
        confirming={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(cls.id);
            toast.success(t("classDeleted"));
            setDeleting(false);
          } catch (error) {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          }
        }}
      />
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={t("editClass")}>
          {editing && (
            <ClassForm
              yearId={year.id}
              initial={cls}
              onDone={() => {
                setEditing(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
