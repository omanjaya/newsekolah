"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  CountBadge,
  DatePicker,
  DialogFooter,
  Field,
  SearchInput,
  Textarea,
  useDebouncedCallback,
  useToast,
} from "@newsekolah/ui";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { useDirectoryNames, useDirectorySearch } from "../../reference/directory-names";
import {
  type ViolationRecordResult,
  useRecordViolationMutation,
  useRefreshDiscipline,
  useViolationTypesQuery,
} from "../api";
import { usePointsPreviewQuery } from "../api-violation-extras";
import { computePointsPreview } from "../lib/points-preview";

const MAX_TYPES = 50;
const MAX_STUDENTS = 50;
const STUDENT_RESULTS = 30;
const SEARCH_DEBOUNCE_MS = 300;

/** A row of a pick list: a 44px target with its checkbox, on the sunken well. */
const PICK_ROW =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-1.5 transition-colors hover:bg-state-hover";

/**
 * Records one or several violation types for one or several students in a
 * single submission. The API only accepts one student per call
 * (`useRecordViolationMutation`'s `student_user_id`), so a multi-student
 * submission loops the same mutation once per selected student and
 * collects every `ViolationRecordResult` -- the caller shows a per-student
 * summary (points and any warning-letter level newly due) from that list.
 * Before saving, it previews each student's new total and any warning
 * letter that total would cross. When a batch stops part-way, the students
 * already saved leave the selection and are named in an alert, so saving
 * again records only the rest instead of duplicating the first ones.
 */
export function ViolationRecordForm({
  onDone,
  initialStudentIds = [],
}: {
  onDone: (results?: ViolationRecordResult[]) => void;
  /** Students already picked, when the form opens from one student's record. */
  initialStudentIds?: string[];
}): ReactElement {
  const t = useTranslations("app.discipline.violations.form");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const types = useViolationTypesQuery();
  const record = useRecordViolationMutation();

  const [studentSearch, setStudentSearch] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const debounceStudentQuery = useDebouncedCallback(setStudentQuery, SEARCH_DEBOUNCE_MS);
  const [studentIds, setStudentIds] = useState<string[]>(initialStudentIds);
  const [typeSearch, setTypeSearch] = useState("");
  const [typeIds, setTypeIds] = useState<string[]>([]);
  // "Today" is the school's calendar day, not the UTC one.
  const { me } = useSession();
  const today = todayInZone(me?.tenant.timezone);
  const [occurredOn, setOccurredOn] = useState(today);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  // Students already saved by earlier, interrupted attempts, all of them:
  // their results for the summary, their names for the partial-save alert.
  const [savedResults, setSavedResults] = useState<ViolationRecordResult[]>([]);
  const [savedNames, setSavedNames] = useState<string[]>([]);
  // Why the latest attempt stopped, while some students are saved already.
  const [failure, setFailure] = useState<string | null>(null);
  const refreshDiscipline = useRefreshDiscipline();

  const preview = usePointsPreviewQuery(studentIds);

  // Search on the server; the picked students' names come from the same
  // cache the search results are written to.
  const found = useDirectorySearch({
    profileKind: "student",
    query: studentQuery,
    limit: STUDENT_RESULTS,
  });
  const visibleStudents = found.data ?? [];
  const studentMap = useDirectoryNames(studentIds);

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
  const crossesLevel = previewRows.some((row) => row.crossedLevels.length > 0);

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
    setAttempted(true);
    if (studentIds.length === 0 || typeIds.length === 0 || !occurredOn) return;
    setSubmitting(true);
    const results: ViolationRecordResult[] = [...savedResults];
    const savedNow: string[] = [];
    try {
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
        savedNow.push(studentId);
      }
      toast.success(t("recorded", { count: results.length }));
      onDone(results);
    } catch (error) {
      const message =
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN");
      // A batch that stops part-way must not be saved again as a whole:
      // the students already recorded leave the selection (and the summary
      // keeps their results), so "Simpan" retries only the rest. The
      // refresh also brings the points preview up to date with whatever
      // the server did commit.
      // The alert covers every attempt so far, so a retry that fails on its
      // first remaining student still names the students saved before it.
      void refreshDiscipline();
      if (savedNow.length > 0) {
        const namesNow = savedNow.map((id) => studentMap.get(id)?.name ?? t("unknownStudent"));
        setSavedResults(results);
        setSavedNames((current) => [...current, ...namesNow]);
        setStudentIds((current) => current.filter((id) => !savedNow.includes(id)));
      }
      if (results.length > 0) {
        setFailure(message);
      } else {
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field
        label={t("student")}
        required
        error={attempted && studentIds.length === 0 ? t("studentRequired") : undefined}
        labelAside={
          studentIds.length > 0 ? (
            <span className="text-caption text-fg-muted">
              {t("studentsSelected", { count: studentIds.length })}
            </span>
          ) : undefined
        }
      >
        {(control) => (
          <div className="flex flex-col gap-2">
            {studentIds.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label={t("selectedStudents")}>
                {studentIds.map((id) => {
                  const name = studentMap.get(id)?.name ?? t("unknownStudent");
                  return (
                    <li key={id}>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<X />}
                        aria-label={t("removeStudent", { name })}
                        onClick={() => {
                          toggleStudent(id);
                        }}
                      >
                        {name}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            <SearchInput
              id={control.id}
              aria-describedby={control["aria-describedby"]}
              value={studentSearch}
              onChange={(e) => {
                setStudentSearch(e.target.value);
                debounceStudentQuery(e.target.value.trim());
              }}
              placeholder={t("studentSearchPlaceholder")}
              aria-label={t("studentSearchPlaceholder")}
            />
            <Card tone="sunken" className="max-h-52 overflow-y-auto p-1">
              {visibleStudents.length === 0 ? (
                <p className="px-3 py-2.5 text-body-sm text-fg-muted">{t("noStudents")}</p>
              ) : (
                visibleStudents.map((student) => {
                  const checked = studentIds.includes(student.id);
                  const disabled = !checked && studentIds.length >= MAX_STUDENTS;
                  return (
                    <Checkbox
                      key={student.id}
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={() => {
                        toggleStudent(student.id);
                      }}
                      containerClassName={PICK_ROW}
                      label={
                        <span className="flex min-w-0 items-center gap-3">
                          <Avatar size={32} name={student.name} decorative />
                          <span className="min-w-0 flex-1 truncate">{student.name}</span>
                        </span>
                      }
                    />
                  );
                })
              )}
            </Card>
            {studentIds.length >= MAX_STUDENTS && (
              <p className="text-caption text-fg-muted">{t("maxStudentsReached")}</p>
            )}
          </div>
        )}
      </Field>

      <Field
        label={t("type")}
        required
        error={attempted && typeIds.length === 0 ? t("typeRequired") : undefined}
        labelAside={
          typeIds.length > 0 ? (
            <span className="text-caption text-fg-muted">
              {t("selectedTotal", { points: pointsPerStudent })}
            </span>
          ) : undefined
        }
      >
        {(control) =>
          activeTypes.length === 0 ? (
            <p className="text-body-sm text-fg-muted">{t("noTypes")}</p>
          ) : (
            <div className="flex flex-col gap-2">
              <SearchInput
                id={control.id}
                aria-describedby={control["aria-describedby"]}
                value={typeSearch}
                onChange={(e) => {
                  setTypeSearch(e.target.value);
                }}
                placeholder={t("typeSearchPlaceholder")}
                aria-label={t("typeSearchPlaceholder")}
              />
              <Card tone="sunken" className="max-h-56 overflow-y-auto p-1">
                {visibleTypes.length === 0 ? (
                  <p className="px-3 py-2.5 text-body-sm text-fg-muted">{t("noMatch")}</p>
                ) : (
                  visibleTypes.map((type) => {
                    const checked = typeIds.includes(type.id);
                    const disabled = !checked && typeIds.length >= MAX_TYPES;
                    return (
                      <Checkbox
                        key={type.id}
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={() => {
                          toggleType(type.id);
                        }}
                        containerClassName={PICK_ROW}
                        label={
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="min-w-0 flex-1">{type.name}</span>
                            <Badge tone={checked ? "warning" : "neutral"} size="sm">
                              {t("points", { points: type.points })}
                            </Badge>
                          </span>
                        }
                      />
                    );
                  })
                )}
              </Card>
              {typeIds.length >= MAX_TYPES && (
                <p className="text-caption text-fg-muted">{t("maxTypesReached")}</p>
              )}
            </div>
          )
        }
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label={t("date")} required>
          <DatePicker
            name="occurred_on"
            value={occurredOn}
            onChange={setOccurredOn}
            max={today}
            today={today}
          />
        </Field>
        <Field label={t("notes")} optional className="sm:col-span-2">
          <Textarea
            rows={2}
            autoResize
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
            }}
            placeholder={t("notesPlaceholder")}
            maxLength={1000}
          />
        </Field>
      </div>

      {showPreview && (
        <Alert variant={crossesLevel ? "warning" : "info"} title={t("preview.title")}>
          {preview.isPending ? (
            <p>{t("preview.loading")}</p>
          ) : preview.isError ? (
            <p>{t("preview.error")}</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1.5">
              {previewRows.map((row) => {
                const name = studentMap.get(row.studentUserId)?.name ?? t("unknownStudent");
                return (
                  <li key={row.studentUserId} className="flex flex-col">
                    <span className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">{name}</span>
                      <span className="shrink-0 tabular-nums">
                        {t("preview.totals", {
                          current: row.currentPoints,
                          added: row.addedPoints,
                          next: row.newPoints,
                        })}
                      </span>
                    </span>
                    {row.crossedLevels.map((level) => (
                      <span key={level.level} className="font-semibold">
                        {t("preview.crosses", { level: level.label })}
                      </span>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </Alert>
      )}

      {failure !== null && savedNames.length > 0 && (
        <Alert variant="danger" title={t("partial.title", { count: savedNames.length })}>
          <p>{t("partial.saved", { names: savedNames.join(", ") })}</p>
          <p>{failure}</p>
          <p>{t("partial.rest")}</p>
        </Alert>
      )}

      <DialogFooter>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onDone(savedResults.length > 0 ? savedResults : undefined);
          }}
        >
          {t("cancel")}
        </Button>
        <Button type="submit" loading={submitting}>
          {t("submit")}
          {studentIds.length > 1 && <CountBadge count={studentIds.length} tone="neutral" />}
        </Button>
      </DialogFooter>
    </form>
  );
}
