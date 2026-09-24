"use client";

import { cn } from "@newsekolah/ui";
import { Star } from "lucide-react";
import type { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { AssessmentComponent, GradebookStudent } from "../api";

import { GradebookScoreCell } from "./gradebook-score-cell";
import type { Edits } from "./gradebook-types";

export interface GradebookMobileCardsProps {
  t: ReturnType<typeof useTranslations>;
  components: AssessmentComponent[];
  students: GradebookStudent[];
  canManage: boolean;
  edits: Edits;
  cellValue: (componentId: string, student: GradebookStudent) => string;
  starBalances: Map<string, number>;
  scaleMin: number;
  scaleMax: number;
  liveByStudent: Map<string, { average: number | undefined; missing: number }>;
  pendingStudentIds: Set<string>;
  onManualOverride: (student: GradebookStudent) => void;
  onGiveStar: (student: GradebookStudent) => void;
  onCommit: (componentId: string, studentId: string, value: string) => void;
  onRegisterRef: (refKey: string, el: HTMLInputElement | null) => void;
}

/**
 * The score matrix as one card per student, every component stacked as a
 * labelled row -- the phone's "student by student" entry mode (the
 * counterpart to `GradebookMobileComponentEntry`'s "one component at a
 * time"), for a teacher who prefers to finish one student completely
 * before moving to the next.
 */
export function GradebookMobileCards({
  t,
  components,
  students,
  canManage,
  edits,
  cellValue,
  starBalances,
  scaleMin,
  scaleMax,
  liveByStudent,
  pendingStudentIds,
  onManualOverride,
  onGiveStar,
  onCommit,
  onRegisterRef,
}: GradebookMobileCardsProps): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      {students.map((student, rowIndex) => {
        const live = liveByStudent.get(student.student_user_id);
        const pending = pendingStudentIds.has(student.student_user_id);
        return (
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
              {components.map((component) => {
                const changed = edits[component.id]?.[student.student_user_id] !== undefined;
                return (
                  <div key={component.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-fg">{component.code}</p>
                      <p className="truncate text-[12px] text-fg-muted">
                        {t("weightLabel", { weight: component.weight })}
                        {component.kktp !== undefined ? ` · KKTP ${component.kktp}` : ""}
                      </p>
                    </div>
                    <GradebookScoreCell
                      studentId={student.student_user_id}
                      componentId={component.id}
                      rowIndex={rowIndex}
                      value={cellValue(component.id, student)}
                      disabled={!canManage}
                      ariaLabel={t("scoreFor", { name: student.name, code: component.code })}
                      className="w-20 shrink-0 text-right [font-variant-numeric:tabular-nums]"
                      min={scaleMin}
                      max={scaleMax}
                      changed={changed}
                      onCommit={onCommit}
                      onRegisterRef={onRegisterRef}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-[13px]">
              <span className="text-fg-muted [font-variant-numeric:tabular-nums]">
                {t("averageColumn")} {live?.average !== undefined ? live.average.toFixed(1) : "-"}
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
                {pending && (
                  <span
                    className="ml-1 inline-block size-1.5 rounded-full bg-accent align-middle"
                    aria-label={t("reportScorePending")}
                  />
                )}
              </button>
            </div>
          </div>
        );
      })}
      {students.length === 0 && (
        <p className="p-6 text-center text-[13px] text-fg-muted">{t("noMatch")}</p>
      )}
    </div>
  );
}
