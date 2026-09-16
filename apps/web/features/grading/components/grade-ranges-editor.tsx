"use client";

import { ApiError } from "@newsekolah/api-client";
import { Alert, Button, IconButton, Input, Select, Skeleton, useToast } from "@newsekolah/ui";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { useDirectoryQuery, useSubjectsQuery } from "../../reference/api";
import { type GradeRangeEntry, useGradeRangesQuery, useReplaceGradeRangesMutation } from "../api";

const SELF_TEACHER = "self";
const SCHOOL_WIDE = "school";

/**
 * Report-score increase ranges for one subject-teacher scope, saved as one
 * replace-all call: the API validates every range in the scope together
 * and refuses an overlapping set (GRADE_RANGE_OVERLAP), so partial saves
 * never leave the scope in a half-edited state.
 */
export function GradeRangesEditor({
  canManageSettings,
}: {
  canManageSettings: boolean;
}): ReactElement {
  const t = useTranslations("app.grading.settings");
  const { me } = useSession();
  const subjects = useSubjectsQuery();
  const teachers = useDirectoryQuery("teacher", canManageSettings);
  const allRanges = useGradeRangesQuery();

  const [subjectId, setSubjectId] = useState("");
  const [teacherScope, setTeacherScope] = useState(canManageSettings ? SCHOOL_WIDE : SELF_TEACHER);

  const teacherUserId =
    teacherScope === SELF_TEACHER
      ? me?.id
      : teacherScope === SCHOOL_WIDE
        ? undefined
        : teacherScope;

  const subjectOptions = (subjects.data?.data ?? []).map((s) => ({ value: s.id, label: s.name }));
  const teacherOptions = [
    ...(canManageSettings
      ? [
          { value: SCHOOL_WIDE, label: t("rangeSchoolWide") },
          ...(teachers.data?.data ?? []).map((teacher) => ({
            value: teacher.id,
            label: teacher.name,
          })),
        ]
      : []),
    { value: SELF_TEACHER, label: t("rangeYourOwn") },
  ];

  const scopeRanges = (allRanges.data?.data ?? []).filter(
    (r) => r.subject_id === subjectId && r.teacher_user_id === teacherUserId,
  );

  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <h2 className="text-[16px] font-medium text-fg">{t("rangesTitle")}</h2>
      <p className="text-[13px] text-fg-muted">{t("rangesHint")}</p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("rangeSubject")}</span>
          <Select
            options={subjectOptions}
            value={subjectId}
            onValueChange={setSubjectId}
            placeholder={t("rangeSubjectPlaceholder")}
            className="w-56"
          />
        </label>
        {canManageSettings ? (
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("rangeScope")}</span>
            <Select
              options={teacherOptions}
              value={teacherScope}
              onValueChange={setTeacherScope}
              className="w-56"
            />
          </label>
        ) : (
          <p className="pb-2 text-[13px] text-fg-muted">{t("rangeYourOwnHint")}</p>
        )}
      </div>

      {!subjectId ? (
        <p className="text-[13px] text-fg-muted">{t("rangePickSubjectFirst")}</p>
      ) : allRanges.isLoading ? (
        <Skeleton className="h-24 w-full" aria-busy="true" />
      ) : (
        <RangeRowsEditor
          key={`${subjectId}-${teacherUserId ?? "school"}`}
          subjectId={subjectId}
          teacherUserId={teacherUserId}
          initialRows={scopeRanges.map((r) => ({
            min_score: r.min_score,
            max_score: r.max_score,
            increase_amount: r.increase_amount,
          }))}
        />
      )}
    </section>
  );
}

/**
 * Owns the editable row list for one scope. Keyed by that scope at the call
 * site, so switching subject or teacher remounts it with a fresh initial
 * state instead of an effect resynchronizing local state from a prop.
 */
function RangeRowsEditor({
  subjectId,
  teacherUserId,
  initialRows,
}: {
  subjectId: string;
  teacherUserId: string | undefined;
  initialRows: GradeRangeEntry[];
}): ReactElement {
  const t = useTranslations("app.grading.settings");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const replaceAll = useReplaceGradeRangesMutation();

  const [rows, setRows] = useState(initialRows);
  const [overlapError, setOverlapError] = useState(false);

  function updateRow(index: number, patch: Partial<GradeRangeEntry>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, { min_score: 0, max_score: 0, increase_amount: 0 }]);
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  async function save() {
    setOverlapError(false);
    try {
      await replaceAll.mutateAsync({
        subject_id: subjectId,
        ...(teacherUserId ? { teacher_user_id: teacherUserId } : {}),
        ranges: rows,
      });
      toast.success(t("rangesSaved"));
    } catch (error) {
      if (error instanceof ApiError && error.code === "GRADE_RANGE_OVERLAP") {
        setOverlapError(true);
        return;
      }
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {overlapError && (
        <Alert variant="warning" title={t("rangeOverlapTitle")}>
          {t("rangeOverlapBody")}
        </Alert>
      )}

      {rows.length === 0 ? (
        <p className="text-[13px] text-fg-muted">{t("rangesEmptyBody")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <li key={index} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="font-medium">{t("rangeMin")}</span>
                <Input
                  type="number"
                  className="w-24"
                  value={row.min_score}
                  onChange={(e) => {
                    updateRow(index, { min_score: Number(e.target.value) });
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="font-medium">{t("rangeMax")}</span>
                <Input
                  type="number"
                  className="w-24"
                  value={row.max_score}
                  onChange={(e) => {
                    updateRow(index, { max_score: Number(e.target.value) });
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="font-medium">{t("rangeIncrease")}</span>
                <Input
                  type="number"
                  className="w-24"
                  value={row.increase_amount}
                  onChange={(e) => {
                    updateRow(index, { increase_amount: Number(e.target.value) });
                  }}
                />
              </label>
              <IconButton
                icon={<Trash2 />}
                aria-label={t("rangeRemoveRow")}
                onClick={() => {
                  removeRow(index);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="sm" icon={<Plus />} onClick={addRow}>
          {t("rangeAddRow")}
        </Button>
        <Button type="button" size="sm" loading={replaceAll.isPending} onClick={() => void save()}>
          {t("rangesSave")}
        </Button>
      </div>
    </div>
  );
}
