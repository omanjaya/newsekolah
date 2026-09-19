"use client";
import { ApiError } from "@newsekolah/api-client";
import {
  Avatar,
  Button,
  EmptyState,
  IconButton,
  Select,
  Skeleton,
  cn,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useLookup, useSubjectsQuery, useTeachersQuery } from "../../reference/api";
import {
  useCreateTeachingAssignmentMutation,
  useDeleteTeachingAssignmentMutation,
  useTeachingAssignmentsQuery,
} from "../api";

/**
 * Split out of class-panels.tsx (which also holds EnrollmentPanel) to keep
 * both files under the project's line limit; see api.ts for the same pattern.
 */
export function TeachingPanel({
  classId,
  canManage,
}: {
  classId: string;
  canManage: boolean;
}): ReactElement {
  const t = useTranslations("app.school.classes");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const year = useActiveYear();
  const assignments = useTeachingAssignmentsQuery(classId);
  const subjects = useSubjectsQuery();
  const teachers = useTeachersQuery();
  const subjectMap = useLookup(subjects.data?.data);
  const teacherMap = useLookup(teachers.data?.data);
  const create = useCreateTeachingAssignmentMutation();
  const remove = useDeleteTeachingAssignmentMutation();
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const rows = useMemo(
    () => (assignments.data?.data ?? []).filter((a) => a.is_active),
    [assignments.data],
  );
  const fail = (error: unknown) =>
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  return (
    <div className="flex flex-col gap-3 md:h-full md:min-h-0">
      {assignments.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<domainIcons.users aria-hidden="true" />}
          title={t("noTeachers")}
          className="p-6"
        />
      ) : (
        <ul className="divide-y divide-border rounded-xs border border-border text-[14px] md:min-h-0 md:flex-1 md:overflow-y-auto">
          {rows.map((a) => {
            const teacherName = teacherMap.get(a.teacher_user_id)?.name ?? "-";
            return (
              <li key={a.id} className="group flex items-center justify-between px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar size="sm" name={teacherName} />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">
                      {subjectMap.get(a.subject_id)?.name ?? "-"}
                    </p>
                    <p className="truncate text-[12px] text-fg-muted">{teacherName}</p>
                  </div>
                </div>
                {canManage && (
                  <IconButton
                    icon={<Trash2 />}
                    aria-label={t("removeTeaching")}
                    className="md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-visible:opacity-100"
                    onClick={() => {
                      remove.mutate(a.id, { onError: fail });
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canManage && (
        <form
          className={cn(
            "flex flex-col gap-2 md:flex-row md:items-end",
            rows.length > 0 && "border-t border-border pt-3",
          )}
          onSubmit={(e) => {
            e.preventDefault();
            if (!subjectId || !teacherId) return;
            create.mutate(
              {
                academic_year_id: year.id,
                class_id: classId,
                subject_id: subjectId,
                teacher_user_id: teacherId,
              },
              {
                onSuccess: () => {
                  setSubjectId("");
                  setTeacherId("");
                  toast.success(t("teachingAdded"));
                },
                onError: fail,
              },
            );
          }}
        >
          <Select
            options={(subjects.data?.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
            value={subjectId}
            onValueChange={setSubjectId}
            placeholder={t("pickSubject")}
            className="md:w-56"
          />
          <Select
            options={(teachers.data?.data ?? []).map((u) => ({ value: u.id, label: u.name }))}
            value={teacherId}
            onValueChange={setTeacherId}
            placeholder={t("pickTeacher")}
            className="md:w-64"
          />
          <Button
            type="submit"
            size="sm"
            loading={create.isPending}
            disabled={!subjectId || !teacherId}
          >
            {t("addTeaching")}
          </Button>
        </form>
      )}
    </div>
  );
}
