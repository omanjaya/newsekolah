"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardTitle,
  ConfirmDialog,
  Dialog,
  DialogContent,
  IconButton,
  RowActionsMenu,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from "@newsekolah/ui";
import { Download, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDeleteClassMutation } from "../../academic/api-school-extras";
import { useDirectoryNames } from "../../reference/directory-names";
import { type ClassRow, useEnrollmentsQuery, useTeachingAssignmentsQuery } from "../api";

import { ClassForm } from "./class-form";
import { EnrollmentPanel } from "./class-panels";
import { ClassRosterExport } from "./class-roster-export";
import { TeachingPanel } from "./teaching-panel";

export const CLASS_TABS = ["students", "teachers"] as const;

/**
 * The selected class: its name with the roster against capacity, the
 * homeroom teacher, the download and a menu for edit and delete, then the
 * students and teachers tabs. One count per thing: the badge says how full
 * the class is, the tabs say how many rows each holds.
 */
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
  const tExport = useTranslations("app.school.classes.rosterExport");
  const year = useActiveYear();
  const teacherMap = useDirectoryNames([cls.homeroom_teacher_id]);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
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
  const full = cls.capacity !== undefined && activeEnrollmentCount >= cls.capacity;

  return (
    <Card className="flex min-w-0 flex-col md:min-h-0">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle as="h2" className="text-title">
              {cls.name}
            </CardTitle>
            {enrollments.data && (
              <Badge tone={full ? "warning" : "neutral"} className="tabular-nums">
                {cls.capacity
                  ? t("rosterOfCapacity", { n: activeEnrollmentCount, max: cls.capacity })
                  : t("studentCount", { n: activeEnrollmentCount })}
              </Badge>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-2 text-body-sm text-fg-muted">
            {homeroomTeacher ? (
              <>
                <Avatar size={24} name={homeroomTeacher.name} decorative />
                <span className="truncate">
                  {t("homeroomLabel")}{" "}
                  <span className="font-medium text-fg">{homeroomTeacher.name}</span>
                </span>
              </>
            ) : (
              <span>{t("noHomeroomLine")}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            icon={<Download />}
            className="max-sm:hidden"
            onClick={() => {
              setExporting(true);
            }}
          >
            {tExport("button")}
          </Button>
          <IconButton
            icon={<Download />}
            aria-label={tExport("button")}
            variant="ghost"
            className="sm:hidden"
            onClick={() => {
              setExporting(true);
            }}
          />
          {canManage && (
            <RowActionsMenu
              ariaLabel={t("classActions", { name: cls.name })}
              items={[
                {
                  label: t("editClass"),
                  icon: <Pencil />,
                  onClick: () => {
                    setEditing(true);
                  },
                },
                {
                  label: t("deleteClass"),
                  icon: <Trash2 />,
                  tone: "danger",
                  onClick: () => {
                    setDeleting(true);
                  },
                },
              ]}
            />
          )}
        </div>
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          onTabChange(value as (typeof CLASS_TABS)[number]);
        }}
        className="flex flex-col pt-3 md:min-h-0 md:flex-1"
      >
        <TabsList variant="underline" className="px-5" aria-label={t("detailTabs")}>
          <TabsTrigger
            value="students"
            count={enrollments.data ? activeEnrollmentCount : undefined}
          >
            {t("tabStudents")}
          </TabsTrigger>
          <TabsTrigger
            value="teachers"
            count={teachingAssignments.data ? activeTeachingCount : undefined}
          >
            {t("tabTeachers")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="students" className="flex flex-col p-4 md:min-h-0 md:flex-1 md:p-5">
          <EnrollmentPanel classId={cls.id} canManage={canManage} />
        </TabsContent>
        <TabsContent value="teachers" className="flex flex-col p-4 md:min-h-0 md:flex-1 md:p-5">
          <TeachingPanel classId={cls.id} canManage={canManage} />
        </TabsContent>
      </Tabs>
      <ClassRosterExport classId={cls.id} open={exporting} onOpenChange={setExporting} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t("deleteClassTitle", { name: cls.name })}
        description={t("deleteClassBody", { name: cls.name })}
        confirmLabel={t("deleteClass")}
        tone="danger"
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
        <DialogContent title={t("editClass")} size="md">
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
    </Card>
  );
}
