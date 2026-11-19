"use client";
import { ApiError } from "@newsekolah/api-client";
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  List,
  ListRow,
  Select,
  SkeletonList,
  domainIcons,
  useToast,
  useSubmitValidation,
} from "@newsekolah/ui";
import { Ban, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useLookup, useSubjectsQuery } from "../../reference/api";
import {
  DirectoryPicker,
  useDirectoryPickerLabels,
} from "../../reference/components/directory-picker";
import { useDirectoryNames } from "../../reference/directory-names";
import {
  useCreateTeachingAssignmentMutation,
  useDeleteTeachingAssignmentMutation,
  useTeachingAssignmentsQuery,
  useUpdateTeachingAssignmentMutation,
} from "../api";

type TeachingRow = NonNullable<
  ReturnType<typeof useTeachingAssignmentsQuery>["data"]
>["data"][number];

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
  const subjectMap = useLookup(subjects.data?.data);
  const create = useCreateTeachingAssignmentMutation();
  const remove = useDeleteTeachingAssignmentMutation();
  const setActive = useUpdateTeachingAssignmentMutation();
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const { ref: formRef, attempted, check, reset } = useSubmitValidation();
  const tValidation = useTranslations("validation");
  const [showInactive, setShowInactive] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<TeachingRow | null>(null);
  const rows = useMemo(
    () => (assignments.data?.data ?? []).filter((a) => a.is_active),
    [assignments.data],
  );
  const inactiveRows = useMemo(
    () => (assignments.data?.data ?? []).filter((a) => !a.is_active),
    [assignments.data],
  );
  const teacherMap = useDirectoryNames(
    (assignments.data?.data ?? []).map((a) => a.teacher_user_id),
  );
  const teacherLabels = useDirectoryPickerLabels(t("pickTeacher"));
  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };
  const row = (a: TeachingRow, inactive: boolean) => {
    const teacherName = teacherMap.get(a.teacher_user_id)?.name ?? "-";
    const pending = setActive.isPending && setActive.variables.id === a.id;
    return (
      <ListRow
        key={a.id}
        className={inactive ? "opacity-70" : undefined}
        leading={<Avatar size={32} name={teacherName} decorative />}
        title={subjectMap.get(a.subject_id)?.name ?? "-"}
        meta={teacherName}
        trailing={inactive ? <Badge tone="neutral">{t("teachingInactive")}</Badge> : undefined}
        action={
          canManage ? (
            <div className="flex items-center gap-1">
              <IconButton
                size="sm"
                variant="ghost"
                icon={inactive ? <RotateCcw /> : <Ban />}
                aria-label={inactive ? t("reactivateTeaching") : t("deactivateTeaching")}
                disabled={pending}
                onClick={() => {
                  setActive.mutate(
                    { id: a.id, isActive: inactive },
                    {
                      onSuccess: () => {
                        toast.success(
                          inactive ? t("teachingReactivated") : t("teachingDeactivated"),
                        );
                      },
                      onError: fail,
                    },
                  );
                }}
              />
              <IconButton
                size="sm"
                variant="ghost"
                icon={<Trash2 />}
                aria-label={t("removeTeaching")}
                onClick={() => {
                  setPendingRemove(a);
                }}
              />
            </div>
          ) : undefined
        }
      />
    );
  };
  return (
    <div className="flex flex-col gap-4 md:h-full md:min-h-0">
      {assignments.isLoading ? (
        <SkeletonList rows={3} framed />
      ) : assignments.isError ? (
        <QueryError retry={() => void assignments.refetch()} error={assignments.error} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<domainIcons.users aria-hidden="true" />}
          title={t("noTeachers")}
          description={canManage ? t("noTeachersBody") : undefined}
        />
      ) : (
        <List framed className="md:min-h-0 md:flex-1 md:overflow-y-auto">
          {rows.map((a) => row(a, false))}
        </List>
      )}
      {inactiveRows.length > 0 && (
        <div className="flex flex-col gap-2">
          <Button
            variant="link"
            className="self-start"
            onClick={() => {
              setShowInactive((prev) => !prev);
            }}
          >
            {showInactive
              ? t("hideInactiveTeaching")
              : t("showInactiveTeaching", { n: inactiveRows.length })}
          </Button>
          {showInactive && <List framed>{inactiveRows.map((a) => row(a, true))}</List>}
        </div>
      )}
      {canManage && (
        <form
          ref={formRef}
          noValidate
          aria-label={t("addTeachingTitle")}
          className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            if (!check(Boolean(subjectId && teacherId))) return;
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
                  reset();
                  toast.success(t("teachingAdded"));
                },
                onError: fail,
              },
            );
          }}
        >
          <Field
            label={t("subjectLabel")}
            required
            error={attempted && !subjectId ? tValidation("required") : undefined}
          >
            <Select
              options={(subjects.data?.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
              value={subjectId}
              onValueChange={setSubjectId}
              placeholder={t("pickSubject")}
            />
          </Field>
          <Field
            label={t("teacherLabel")}
            required
            error={attempted && !teacherId ? tValidation("required") : undefined}
          >
            <DirectoryPicker
              profileKind="teacher"
              value={teacherId}
              onValueChange={setTeacherId}
              labels={teacherLabels}
            />
          </Field>
          {/*
            Top-aligned with an empty label row of the same type role, so the
            button stays level with both controls when a Field below grows
            an error line after Submit (bottom alignment tipped them apart).
          */}
          <div className="flex flex-col gap-2">
            <span aria-hidden="true" className="hidden text-label md:block">
              &nbsp;
            </span>
            <Button type="submit" variant="secondary" icon={<Plus />} loading={create.isPending}>
              {t("addTeaching")}
            </Button>
          </div>
        </form>
      )}
      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
        title={t("removeTeachingTitle")}
        description={
          pendingRemove
            ? t("removeTeachingBody", {
                subject: subjectMap.get(pendingRemove.subject_id)?.name ?? "-",
                teacher: teacherMap.get(pendingRemove.teacher_user_id)?.name ?? "-",
              })
            : ""
        }
        confirmLabel={t("removeTeaching")}
        tone="danger"
        confirming={remove.isPending}
        onConfirm={() => {
          if (!pendingRemove) return;
          remove.mutate(pendingRemove.id, {
            onSuccess: () => {
              setPendingRemove(null);
              toast.success(t("teachingRemoved"));
            },
            onError: (error) => {
              setPendingRemove(null);
              fail(error);
            },
          });
        }}
      />
    </div>
  );
}
