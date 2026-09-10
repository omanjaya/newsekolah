"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, IconButton, Input, cn, useToast } from "@newsekolah/ui";
import { Pencil, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useRef, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type AssessmentComponent,
  type Gradebook,
  type GradebookStudent,
  useSaveComponentScoresMutation,
} from "../api";

type Edits = Record<string, Record<string, string>>;

export interface GradebookTableProps {
  sheet: Gradebook;
  canManage: boolean;
  search: string;
  onEditComponent: (component: AssessmentComponent) => void;
  onManualOverride: (student: GradebookStudent) => void;
  starBalances: Map<string, number>;
  onGiveStar: (student: GradebookStudent) => void;
}

/**
 * The score grid: components as columns, students as rows. Each column
 * keeps its own edit buffer so a teacher can fill several columns before
 * saving any of them; "Simpan" on one column only sends that column's
 * entries and clears its buffer once the server confirms.
 */
export function GradebookTable({
  sheet,
  canManage,
  search,
  onEditComponent,
  onManualOverride,
  starBalances,
  onGiveStar,
}: GradebookTableProps): ReactElement {
  const t = useTranslations("app.grading.table");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const saveScores = useSaveComponentScoresMutation();
  const [edits, setEdits] = useState<Edits>({});
  const [savingComponentId, setSavingComponentId] = useState<string | null>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());

  const components = useMemo(
    () => [...sheet.components].sort((a, b) => a.sequence - b.sequence),
    [sheet.components],
  );
  const students = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? sheet.students.filter((s) => s.name.toLowerCase().includes(q)) : sheet.students;
  }, [sheet.students, search]);

  function cellValue(componentId: string, student: GradebookStudent): string {
    const edited = edits[componentId]?.[student.student_user_id];
    if (edited !== undefined) return edited;
    const original = student.scores[componentId];
    return original === undefined ? "" : String(original);
  }

  function setCell(componentId: string, studentId: string, value: string) {
    setEdits((prev) => ({
      ...prev,
      [componentId]: { ...prev[componentId], [studentId]: value },
    }));
  }

  function focusCell(componentId: string, rowIndex: number) {
    inputRefs.current.get(`${componentId}:${rowIndex}`)?.focus();
  }

  async function saveColumn(componentId: string) {
    const columnEdits = edits[componentId];
    if (!columnEdits) return;
    const entries = Object.entries(columnEdits)
      .filter(([, value]) => value.trim() !== "")
      .map(([student_user_id, value]) => ({ student_user_id, score: Number(value) }))
      .filter((entry) => Number.isFinite(entry.score));
    if (entries.length === 0) return;
    setSavingComponentId(componentId);
    try {
      await saveScores.mutateAsync({ componentId, entries });
      setEdits((prev) => {
        const next = { ...prev };
        next[componentId] = {};
        return next;
      });
      toast.success(t("scoresSaved"));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setSavingComponentId(null);
    }
  }

  if (components.length === 0) {
    return <p className="p-6 text-center text-[13px] text-fg-muted">{t("noComponents")}</p>;
  }

  return (
    <>
      {/* Desktop and tablet: full matrix, components as columns. Below md it hands off to the
          per-student card list, since a phone has no room for this many columns even with scroll. */}
      <div className="hidden overflow-x-auto rounded-sm border border-border bg-surface md:block">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-bg text-left text-fg-muted">
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-48 border-b border-border bg-bg px-3 py-2 font-medium"
              >
                {t("studentColumn")}
              </th>
              {components.map((component) => (
                <th
                  key={component.id}
                  scope="col"
                  className="border-b border-l border-border px-2 py-2 align-top font-medium"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <span className="text-fg">{component.code}</span>
                      {canManage && (
                        <IconButton
                          icon={<Pencil className="size-3.5" />}
                          aria-label={t("editComponent", { code: component.code })}
                          className="size-8 md:size-6 [&>svg]:size-3.5"
                          onClick={() => {
                            onEditComponent(component);
                          }}
                        />
                      )}
                    </div>
                    <span className="text-[12px] font-normal text-fg-muted">
                      {t("weightLabel", { weight: component.weight })}
                      {component.kktp !== undefined ? ` · KKTP ${component.kktp}` : ""}
                    </span>
                    {canManage && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        loading={savingComponentId === component.id}
                        disabled={Object.keys(edits[component.id] ?? {}).length === 0}
                        onClick={() => {
                          void saveColumn(component.id);
                        }}
                      >
                        {t("saveColumn")}
                      </Button>
                    )}
                  </div>
                </th>
              ))}
              <th
                scope="col"
                className="border-b border-l border-border px-3 py-2 text-right font-medium"
              >
                {t("averageColumn")}
              </th>
              <th
                scope="col"
                className="border-b border-l border-border px-3 py-2 text-right font-medium"
              >
                {t("reportScoreColumn")}
              </th>
              <th scope="col" className="border-b border-l border-border px-3 py-2 font-medium">
                {t("starsColumn")}
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((student, rowIndex) => (
              <tr key={student.student_user_id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-border bg-surface px-3 py-2 text-left font-normal text-fg"
                >
                  {student.name}
                </th>
                {components.map((component) => (
                  <td key={component.id} className="border-b border-l border-border px-2 py-1.5">
                    <Input
                      ref={(el) => {
                        const key = `${component.id}:${rowIndex}`;
                        if (el) inputRefs.current.set(key, el);
                        else inputRefs.current.delete(key);
                      }}
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min={0}
                      disabled={!canManage}
                      value={cellValue(component.id, student)}
                      aria-label={t("scoreFor", { name: student.name, code: component.code })}
                      className="w-20 text-right [font-variant-numeric:tabular-nums]"
                      onChange={(e) => {
                        setCell(component.id, student.student_user_id, e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "ArrowDown") {
                          e.preventDefault();
                          focusCell(component.id, rowIndex + 1);
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          focusCell(component.id, rowIndex - 1);
                        }
                      }}
                    />
                  </td>
                ))}
                <td className="border-b border-l border-border px-3 py-2 text-right text-fg [font-variant-numeric:tabular-nums]">
                  {student.average !== undefined ? student.average.toFixed(1) : "-"}
                </td>
                <td className="border-b border-l border-border px-3 py-2 text-right [font-variant-numeric:tabular-nums]">
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => {
                      onManualOverride(student);
                    }}
                    className={cn(
                      "font-medium text-fg underline decoration-dotted underline-offset-2",
                      !canManage && "no-underline",
                    )}
                  >
                    {student.report_score !== undefined ? student.report_score.toFixed(1) : "-"}
                  </button>
                </td>
                <td className="border-b border-l border-border px-3 py-2">
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => {
                      onGiveStar(student);
                    }}
                    className="flex items-center gap-1 text-fg-muted hover:text-fg disabled:hover:text-fg-muted"
                    aria-label={t("starsFor", { name: student.name })}
                  >
                    <Star className="size-3.5" aria-hidden="true" />
                    {starBalances.get(student.student_user_id) ?? 0}
                  </button>
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={components.length + 3} className="px-3 py-6 text-center text-fg-muted">
                  {t("noMatch")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per student, components stacked as labeled rows. Pending edits still
          save per component (same edits state and saveColumn as the desktop table), surfaced
          here as a bar of per-component save buttons instead of one per table column. */}
      <div className="flex flex-col gap-3 md:hidden">
        {students.map((student, rowIndex) => (
          <div
            key={student.student_user_id}
            className="rounded-sm border border-border bg-surface p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[14px] font-medium text-fg">{student.name}</p>
              <button
                type="button"
                disabled={!canManage}
                onClick={() => {
                  onGiveStar(student);
                }}
                className="flex min-h-11 shrink-0 items-center gap-1 px-2 text-fg-muted hover:text-fg disabled:hover:text-fg-muted"
                aria-label={t("starsFor", { name: student.name })}
              >
                <Star className="size-3.5" aria-hidden="true" />
                {starBalances.get(student.student_user_id) ?? 0}
              </button>
            </div>
            <div className="mt-1 flex flex-col divide-y divide-border">
              {components.map((component) => (
                <div key={component.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-fg">{component.code}</p>
                    <p className="truncate text-[12px] text-fg-muted">
                      {t("weightLabel", { weight: component.weight })}
                      {component.kktp !== undefined ? ` · KKTP ${component.kktp}` : ""}
                    </p>
                  </div>
                  <Input
                    ref={(el) => {
                      const key = `mobile:${component.id}:${rowIndex}`;
                      if (el) inputRefs.current.set(key, el);
                      else inputRefs.current.delete(key);
                    }}
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={0}
                    disabled={!canManage}
                    value={cellValue(component.id, student)}
                    aria-label={t("scoreFor", { name: student.name, code: component.code })}
                    className="w-20 shrink-0 text-right [font-variant-numeric:tabular-nums]"
                    onChange={(e) => {
                      setCell(component.id, student.student_user_id, e.target.value);
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-[13px]">
              <span className="text-fg-muted [font-variant-numeric:tabular-nums]">
                {t("averageColumn")}{" "}
                {student.average !== undefined ? student.average.toFixed(1) : "-"}
              </span>
              <button
                type="button"
                disabled={!canManage}
                onClick={() => {
                  onManualOverride(student);
                }}
                className={cn(
                  "min-h-11 px-2 font-medium text-fg underline decoration-dotted underline-offset-2",
                  !canManage && "no-underline",
                )}
              >
                {t("reportScoreColumn")}{" "}
                {student.report_score !== undefined ? student.report_score.toFixed(1) : "-"}
              </button>
            </div>
          </div>
        ))}
        {students.length === 0 && (
          <p className="p-6 text-center text-[13px] text-fg-muted">{t("noMatch")}</p>
        )}
        {canManage && components.some((c) => Object.keys(edits[c.id] ?? {}).length > 0) && (
          <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 border-t border-border bg-surface p-3">
            {components
              .filter((c) => Object.keys(edits[c.id] ?? {}).length > 0)
              .map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={savingComponentId === c.id}
                  onClick={() => {
                    void saveColumn(c.id);
                  }}
                >
                  {t("saveColumn")} · {c.code}
                </Button>
              ))}
          </div>
        )}
      </div>
    </>
  );
}
