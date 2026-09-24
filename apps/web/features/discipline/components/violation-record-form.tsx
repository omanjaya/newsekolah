"use client";

import { ApiError } from "@newsekolah/api-client";
import { Avatar, Badge, Button, Checkbox, Input, Textarea, useToast } from "@newsekolah/ui";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDirectoryQuery } from "../../reference/api";
import {
  type ViolationRecordResult,
  useRecordViolationMutation,
  useViolationTypesQuery,
} from "../api";
import { usePointsPreviewQuery } from "../api-violation-extras";
import { computePointsPreview } from "../lib/points-preview";

const MAX_TYPES = 50;
const MAX_STUDENTS = 50;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Records one or several violation types for one or several students in a
 * single submission. The API only accepts one student per call
 * (`useRecordViolationMutation`'s `student_user_id`), so a multi-student
 * submission loops the same mutation once per selected student and
 * collects every `ViolationRecordResult` -- the caller shows a per-student
 * summary (points and any warning-letter level newly due) from that list.
 */
export function ViolationRecordForm({
  onDone,
}: {
  onDone: (results?: ViolationRecordResult[]) => void;
}): ReactElement {
  const t = useTranslations("app.discipline.violations.form");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const students = useDirectoryQuery("student");
  const types = useViolationTypesQuery();
  const record = useRecordViolationMutation();

  const [studentSearch, setStudentSearch] = useState("");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [typeSearch, setTypeSearch] = useState("");
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [occurredOn, setOccurredOn] = useState(today());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const preview = usePointsPreviewQuery(studentIds);

  const allStudents = useMemo(() => students.data?.data ?? [], [students.data]);
  const studentMap = useMemo(() => new Map(allStudents.map((s) => [s.id, s])), [allStudents]);
  const visibleStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return allStudents.slice(0, 30);
    return allStudents.filter((s) => s.name.toLowerCase().includes(query)).slice(0, 30);
  }, [allStudents, studentSearch]);

  const activeTypes = useMemo(
    () => (types.data?.data ?? []).filter((type) => type.is_active),
    [types.data],
  );
  const visibleTypes = useMemo(() => {
    const query = typeSearch.trim().toLowerCase();
    if (!query) return activeTypes;
    return activeTypes.filter((type) => type.name.toLowerCase().includes(query));
  }, [activeTypes, typeSearch]);

  const pointsPerStudent = useMemo(
    () =>
      activeTypes
        .filter((type) => typeIds.includes(type.id))
        .reduce((sum, type) => sum + type.points, 0),
    [activeTypes, typeIds],
  );

  const previewRows = useMemo(
    () => computePointsPreview(preview.data?.data ?? [], pointsPerStudent, preview.data?.policy),
    [preview.data, pointsPerStudent],
  );
  const showPreview = studentIds.length > 0 && typeIds.length > 0;

  function toggleStudent(id: string) {
    setStudentIds((current) => {
      if (current.includes(id)) return current.filter((v) => v !== id);
      if (current.length >= MAX_STUDENTS) return current;
      return [...current, id];
    });
  }

  function toggleType(id: string) {
    setTypeIds((current) => {
      if (current.includes(id)) return current.filter((v) => v !== id);
      if (current.length >= MAX_TYPES) return current;
      return [...current, id];
    });
  }

  async function submit() {
    if (studentIds.length === 0 || typeIds.length === 0) return;
    setSubmitting(true);
    try {
      const results: ViolationRecordResult[] = [];
      // Sequential, not Promise.all: each call still hits the same
      // student-points invalidation, and a school piling on 50 selections
      // does not need to open 50 connections at once.
      for (const studentId of studentIds) {
        const result = await record.mutateAsync({
          student_user_id: studentId,
          violation_type_ids: typeIds,
          occurred_on: occurredOn,
          notes: notes.trim() || undefined,
        });
        results.push(result);
      }
      toast.success(t("recorded", { count: studentIds.length }));
      onDone(results);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-col gap-1 text-[13px]">
        <div className="flex items-center justify-between">
          <span className="font-medium">{t("student")}</span>
          {studentIds.length > 0 && (
            <span className="text-fg-muted">
              {t("studentsSelected", { count: studentIds.length })}
            </span>
          )}
        </div>
        {studentIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {studentIds.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  toggleStudent(id);
                }}
                className="flex min-h-7 items-center gap-1 rounded-full border border-accent bg-accent/10 px-2.5 text-[12px] font-medium text-accent"
              >
                {studentMap.get(id)?.name ?? t("unknownStudent")}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}
        <Input
          value={studentSearch}
          onChange={(e) => {
            setStudentSearch(e.target.value);
          }}
          placeholder={t("studentSearchPlaceholder")}
          aria-label={t("studentSearchPlaceholder")}
        />
        <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-sm border border-border p-1">
          {visibleStudents.length === 0 ? (
            <p className="px-2 py-2 text-fg-muted">{t("noStudents")}</p>
          ) : (
            visibleStudents.map((student) => {
              const checked = studentIds.includes(student.id);
              const disabled = !checked && studentIds.length >= MAX_STUDENTS;
              return (
                <label
                  key={student.id}
                  className="flex min-h-10 items-center gap-2 rounded-xs px-1.5 py-1 hover:bg-bg"
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={() => {
                      toggleStudent(student.id);
                    }}
                  />
                  <Avatar size="sm" name={student.name} />
                  <span className="flex-1 truncate text-fg">{student.name}</span>
                </label>
              );
            })
          )}
        </div>
        {studentIds.length >= MAX_STUDENTS && (
          <p className="text-fg-muted">{t("maxStudentsReached")}</p>
        )}
      </div>

      <div className="flex flex-col gap-1 text-[13px]">
        <div className="flex items-center justify-between">
          <span className="font-medium">{t("type")}</span>
          {typeIds.length > 0 && (
            <span className="text-fg-muted">
              {t("selectedTotal", { points: pointsPerStudent })}
            </span>
          )}
        </div>
        {activeTypes.length === 0 ? (
          <p className="text-fg-muted">{t("noTypes")}</p>
        ) : (
          <>
            <Input
              value={typeSearch}
              onChange={(e) => {
                setTypeSearch(e.target.value);
              }}
              placeholder={t("typeSearchPlaceholder")}
              aria-label={t("typeSearchPlaceholder")}
            />
            <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-sm border border-border p-2">
              {visibleTypes.length === 0 ? (
                <p className="px-1.5 py-2 text-fg-muted">{t("noMatch")}</p>
              ) : (
                visibleTypes.map((type) => {
                  const checked = typeIds.includes(type.id);
                  const disabled = !checked && typeIds.length >= MAX_TYPES;
                  return (
                    <label
                      key={type.id}
                      className="flex min-h-9 items-center gap-2 rounded-xs px-1.5 py-1 hover:bg-bg"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={() => {
                          toggleType(type.id);
                        }}
                      />
                      <span className="flex-1 text-fg">{type.name}</span>
                      <span className="text-fg-muted [font-variant-numeric:tabular-nums]">
                        {type.points}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </>
        )}
        {typeIds.length >= MAX_TYPES && <p className="text-fg-muted">{t("maxTypesReached")}</p>}
      </div>

      {showPreview && (
        <div className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-3 text-[13px]">
          <span className="font-medium text-fg">{t("preview.title")}</span>
          {preview.isPending ? (
            <p className="text-fg-muted">{t("preview.loading")}</p>
          ) : preview.isError ? (
            <p className="text-fg-muted">{t("preview.error")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {previewRows.map((row) => {
                const name = studentMap.get(row.studentUserId)?.name ?? t("unknownStudent");
                return (
                  <li key={row.studentUserId} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-fg">{name}</span>
                      <span className="shrink-0 text-fg-muted [font-variant-numeric:tabular-nums]">
                        {t("preview.totals", {
                          current: row.currentPoints,
                          added: row.addedPoints,
                          next: row.newPoints,
                        })}
                      </span>
                    </div>
                    {row.crossedLevels.map((level) => (
                      <div key={level.level} className="flex items-center gap-1.5 text-status-late">
                        <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                        <span>{t("preview.crosses", { level: level.label })}</span>
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("date")}</span>
        <Input
          type="date"
          value={occurredOn}
          onChange={(e) => {
            setOccurredOn(e.target.value);
          }}
          max={today()}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("notes")}</span>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          placeholder={t("notesPlaceholder")}
          maxLength={1000}
        />
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onDone();
          }}
        >
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          loading={submitting}
          disabled={studentIds.length === 0 || typeIds.length === 0}
        >
          {t("submit")}
          {studentIds.length > 1 && <Badge variant="neutral">{studentIds.length}</Badge>}
        </Button>
      </div>
    </form>
  );
}
