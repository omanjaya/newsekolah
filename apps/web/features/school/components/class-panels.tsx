"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  IconButton,
  Input,
  Select,
  Skeleton,
  useToast,
} from "@newsekolah/ui";
import { ArrowRightLeft, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useMoveStudentMutation } from "../../academic/api-school-extras";
import {
  useClassesQuery,
  useDirectoryQuery,
  useLookup,
  useSubjectsQuery,
  useTeachersQuery,
} from "../../reference/api";
import {
  type Enrollment,
  useBulkAssignMutation,
  useCreateTeachingAssignmentMutation,
  useDeleteTeachingAssignmentMutation,
  useEnrollmentsQuery,
  useTeachingAssignmentsQuery,
  useUnassignedStudentsQuery,
} from "../api";

export function EnrollmentPanel({
  classId,
  canManage,
}: {
  classId: string;
  canManage: boolean;
}): ReactElement {
  const t = useTranslations("app.school.classes");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const enrollments = useEnrollmentsQuery(classId);
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const unassigned = useUnassignedStudentsQuery(search, adding);
  const assign = useBulkAssignMutation(classId);
  const [picked, setPicked] = useState<string[]>([]);
  const rows = (enrollments.data?.data ?? []).filter((e) => e.status === "active");

  const classes = useClassesQuery();
  const moveTargets = (classes.data?.data ?? []).filter((c) => c.id !== classId);
  const moveStudent = useMoveStudentMutation(classId);
  const [moving, setMoving] = useState<Enrollment | null>(null);
  const [toClassId, setToClassId] = useState("");
  const [effectiveOn, setEffectiveOn] = useState(() => new Date().toISOString().slice(0, 10));

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-fg-muted">{t("studentCount", { n: rows.length })}</span>
        {canManage && (
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus />}
            onClick={() => {
              setAdding(true);
            }}
          >
            {t("assignStudents")}
          </Button>
        )}
      </div>
      {enrollments.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-fg-muted">{t("noStudents")}</p>
      ) : (
        <ol className="grid gap-1 text-[14px] md:grid-cols-2">
          {rows.map((e, i) => (
            <li key={e.id} className="flex items-center gap-2 rounded-xs px-2 py-1">
              <span className="w-6 shrink-0 text-right text-fg-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">
                {studentMap.get(e.student_user_id)?.name ?? e.student_user_id}
              </span>
              {canManage && (
                <IconButton
                  icon={<ArrowRightLeft />}
                  aria-label={t("moveStudent")}
                  onClick={() => {
                    setMoving(e);
                    setToClassId("");
                  }}
                />
              )}
            </li>
          ))}
        </ol>
      )}
      <Dialog
        open={adding}
        onOpenChange={(o) => {
          setAdding(o);
          if (!o) setPicked([]);
        }}
      >
        <DialogContent title={t("assignStudents")}>
          <div className="flex flex-col gap-3">
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              placeholder={t("searchStudent")}
            />
            <div className="max-h-72 overflow-y-auto rounded-xs border border-border">
              {(unassigned.data?.data ?? []).map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 border-b border-border px-3 py-2 text-[14px] last:border-b-0"
                >
                  <Checkbox
                    checked={picked.includes(s.id)}
                    onCheckedChange={() => {
                      setPicked((p) =>
                        p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id],
                      );
                    }}
                  />
                  {s.name} <span className="text-[12px] text-fg-muted">{s.username}</span>
                </label>
              ))}
              {!unassigned.isLoading && (unassigned.data?.data ?? []).length === 0 && (
                <p className="p-3 text-[13px] text-fg-muted">{t("noUnassigned")}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setAdding(false);
                }}
              >
                {t("form.cancel")}
              </Button>
              <Button
                disabled={picked.length === 0}
                loading={assign.isPending}
                onClick={() => {
                  assign.mutate(
                    { student_user_ids: picked, joined_on: new Date().toISOString().slice(0, 10) },
                    {
                      onSuccess: (r) => {
                        toast.success(t("assigned", { n: r.assigned.length }));
                        setAdding(false);
                        setPicked([]);
                      },
                      onError: fail,
                    },
                  );
                }}
              >
                {t("assignCount", { n: picked.length })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={moving !== null}
        onOpenChange={(o) => {
          if (!o) setMoving(null);
        }}
      >
        <DialogContent title={t("moveStudent")}>
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-fg-muted">
              {moving
                ? t("moveBody", {
                    name: studentMap.get(moving.student_user_id)?.name ?? moving.student_user_id,
                  })
                : ""}
            </p>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("moveTargetClass")}</span>
              <Select
                options={moveTargets.map((c) => ({ value: c.id, label: c.name }))}
                value={toClassId}
                onValueChange={setToClassId}
                placeholder={t("moveTargetPlaceholder")}
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("moveEffectiveOn")}</span>
              <Input
                type="date"
                value={effectiveOn}
                onChange={(e) => {
                  setEffectiveOn(e.target.value);
                }}
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setMoving(null);
                }}
              >
                {t("form.cancel")}
              </Button>
              <Button
                disabled={!toClassId}
                loading={moveStudent.isPending}
                onClick={() => {
                  if (!moving) return;
                  moveStudent.mutate(
                    {
                      enrollmentId: moving.id,
                      body: { to_class_id: toClassId, effective_on: effectiveOn },
                    },
                    {
                      onSuccess: () => {
                        toast.success(t("moved"));
                        setMoving(null);
                      },
                      onError: fail,
                    },
                  );
                }}
              >
                {t("moveSubmit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {assignments.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-fg-muted">{t("noTeachers")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xs border border-border text-[14px]">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-3 py-2">
              <span>
                {subjectMap.get(a.subject_id)?.name ?? "-"}{" "}
                <span className="text-fg-muted">
                  · {teacherMap.get(a.teacher_user_id)?.name ?? "-"}
                </span>
              </span>
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 />}
                  aria-label={t("removeTeaching")}
                  onClick={() => {
                    remove.mutate(a.id, { onError: fail });
                  }}
                >
                  {t("removeTeaching")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <form
          className="flex flex-col gap-2 md:flex-row md:items-end"
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
