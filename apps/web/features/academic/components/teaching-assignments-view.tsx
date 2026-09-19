"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Select,
  Skeleton,
  useToast,
} from "@newsekolah/ui";
import { Plus, Trash2, UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type DirectoryUser,
  type SubjectRef,
  useLookup,
  useSubjectsQuery,
  useTeachersQuery,
} from "../../reference/api";
import { useAcademicYearsQuery } from "../api";
import {
  type ClassRow,
  type SubjectClassPair,
  useClassesForYearQuery,
  useSyncTeacherAssignmentsMutation,
  useTeachingAssignmentsForTeacherQuery,
} from "../api-offerings";

function pairKey(pair: SubjectClassPair): string {
  return `${pair.subject_id}:${pair.class_id}`;
}

/**
 * Keyed by (year, teacher) in the parent so switching either resets this
 * editor with a fresh `useState` initializer, instead of syncing the pair
 * list through an effect whenever the fetched assignments change.
 */
function AssignmentsEditor({
  yearId,
  teacherId,
  teacherName,
  initialPairs,
  subjects,
  subjectMap,
  classes,
  classMap,
  canManage,
}: {
  yearId: string;
  teacherId: string;
  teacherName: string;
  initialPairs: SubjectClassPair[];
  subjects: SubjectRef[];
  subjectMap: Map<string, SubjectRef>;
  classes: ClassRow[];
  classMap: Map<string, ClassRow>;
  canManage: boolean;
}): ReactElement {
  const t = useTranslations("app.academic.teachingAssignments");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const sync = useSyncTeacherAssignmentsMutation(yearId, teacherId);

  const [pairs, setPairs] = useState<SubjectClassPair[]>(initialPairs);
  const [subjectId, setSubjectId] = useState("");
  const [classId, setClassId] = useState("");
  const [confirming, setConfirming] = useState(false);

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  function addPair() {
    if (!subjectId || !classId) return;
    const candidate = { subject_id: subjectId, class_id: classId };
    if (pairs.some((p) => pairKey(p) === pairKey(candidate))) return;
    setPairs((prev) => [...prev, candidate]);
    setSubjectId("");
    setClassId("");
  }

  return (
    <>
      <ul className="divide-y divide-border rounded-xs border border-border text-[14px]">
        {pairs.map((pair) => (
          <li key={pairKey(pair)} className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="min-w-0 truncate">
              {subjectMap.get(pair.subject_id)?.name ?? "-"}{" "}
              <span className="text-fg-muted">· {classMap.get(pair.class_id)?.name ?? "-"}</span>
            </span>
            {canManage && (
              <IconButton
                icon={<Trash2 />}
                aria-label={t("removePair")}
                onClick={() => {
                  setPairs((prev) => prev.filter((p) => pairKey(p) !== pairKey(pair)));
                }}
              />
            )}
          </li>
        ))}
        {pairs.length === 0 && (
          <li className="px-3 py-6 text-center text-[13px] text-fg-muted">{t("noAssignments")}</li>
        )}
      </ul>

      {canManage && (
        <div className="flex flex-wrap items-end gap-2">
          <Select
            options={subjects.map((s) => ({ value: s.id, label: s.name }))}
            value={subjectId}
            onValueChange={setSubjectId}
            placeholder={t("pickSubject")}
            className="w-56"
          />
          <Select
            options={classes.map((c) => ({ value: c.id, label: c.name }))}
            value={classId}
            onValueChange={setClassId}
            placeholder={t("pickClass")}
            className="w-56"
          />
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus />}
            disabled={!subjectId || !classId}
            onClick={addPair}
          >
            {t("addPair")}
          </Button>
        </div>
      )}

      {canManage && (
        <div className="flex justify-end border-t border-border pt-4">
          <Button
            onClick={() => {
              setConfirming(true);
            }}
          >
            {t("save")}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("confirmTitle")}
        description={t("confirmBody", { n: pairs.length, teacher: teacherName })}
        confirming={sync.isPending}
        onConfirm={async () => {
          try {
            await sync.mutateAsync(pairs);
            toast.success(t("saved"));
            setConfirming(false);
          } catch (error) {
            fail(error);
            setConfirming(false);
          }
        }}
      />
    </>
  );
}

/**
 * Replaces a teacher's whole teaching load for one academic year in a
 * single call (`/teaching-assignments/sync`), rather than adding and
 * removing one assignment at a time -- useful when reshuffling a teacher's
 * schedule across several classes at once.
 */
export function TeachingAssignmentsView(): ReactElement {
  const t = useTranslations("app.academic.teachingAssignments");
  const canManage = useCan("manage_master_data");
  const activeYear = useActiveYear();
  const years = useAcademicYearsQuery();
  const [yearId, setYearId] = useState("");
  const effectiveYearId = yearId || activeYear.id;

  const teachers = useTeachersQuery();
  const teacherMap = useLookup<DirectoryUser>(teachers.data?.data);
  const [teacherId, setTeacherId] = useState("");

  const subjects = useSubjectsQuery();
  const subjectMap = useLookup(subjects.data?.data);
  const classes = useClassesForYearQuery(effectiveYearId);
  const classMap = useLookup(classes.data?.data);

  const assignments = useTeachingAssignmentsForTeacherQuery(effectiveYearId, teacherId);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[18px] font-medium text-fg">{t("title")}</h2>
      <p className="text-[13px] text-fg-muted">{t("description")}</p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("year")}</span>
          <Select
            options={(years.data?.data ?? []).map((y) => ({ value: y.id, label: y.label }))}
            value={effectiveYearId}
            onValueChange={setYearId}
            className="w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("teacher")}</span>
          <Select
            options={(teachers.data?.data ?? []).map((u) => ({ value: u.id, label: u.name }))}
            value={teacherId}
            onValueChange={setTeacherId}
            placeholder={t("pickTeacher")}
            className="w-64"
          />
        </label>
      </div>

      {!teacherId ? (
        <EmptyState
          icon={<UsersRound aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : assignments.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <AssignmentsEditor
          key={`${effectiveYearId}:${teacherId}`}
          yearId={effectiveYearId}
          teacherId={teacherId}
          teacherName={teacherMap.get(teacherId)?.name ?? ""}
          initialPairs={(assignments.data?.data ?? [])
            .filter((a) => a.is_active)
            .map((a) => ({ subject_id: a.subject_id, class_id: a.class_id }))}
          subjects={subjects.data?.data ?? []}
          subjectMap={subjectMap}
          classes={classes.data?.data ?? []}
          classMap={classMap}
          canManage={canManage}
        />
      )}
    </div>
  );
}
