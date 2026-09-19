"use client";

import { Button, IconButton, cn } from "@newsekolah/ui";
import { Pencil, Star } from "lucide-react";
import type { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { AssessmentComponent, GradebookStudent } from "../api";

import { GradebookScoreCell } from "./gradebook-score-cell";
import type { Edits } from "./gradebook-types";

export interface GradebookDesktopTableProps {
  t: ReturnType<typeof useTranslations>;
  components: AssessmentComponent[];
  students: GradebookStudent[];
  canManage: boolean;
  edits: Edits;
  cellValue: (componentId: string, student: GradebookStudent) => string;
  savingComponentId: string | null;
  starBalances: Map<string, number>;
  onEditComponent: (component: AssessmentComponent) => void;
  onManualOverride: (student: GradebookStudent) => void;
  onGiveStar: (student: GradebookStudent) => void;
  onSaveColumn: (componentId: string) => void;
  onCommit: (componentId: string, studentId: string, value: string) => void;
  onRegisterRef: (refKey: string, el: HTMLInputElement | null) => void;
  onNavigate: (componentId: string, rowIndex: number, direction: "down" | "up") => void;
}

/** The score matrix as a table: components as columns, students as rows. Desktop/tablet only. */
export function GradebookDesktopTable({
  t,
  components,
  students,
  canManage,
  edits,
  cellValue,
  savingComponentId,
  starBalances,
  onEditComponent,
  onManualOverride,
  onGiveStar,
  onSaveColumn,
  onCommit,
  onRegisterRef,
  onNavigate,
}: GradebookDesktopTableProps): ReactElement {
  return (
    <div className="overflow-x-auto rounded-sm border border-border bg-surface">
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
                        onSaveColumn(component.id);
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
                  <GradebookScoreCell
                    studentId={student.student_user_id}
                    componentId={component.id}
                    rowIndex={rowIndex}
                    value={cellValue(component.id, student)}
                    disabled={!canManage}
                    ariaLabel={t("scoreFor", { name: student.name, code: component.code })}
                    className="w-20 text-right [font-variant-numeric:tabular-nums]"
                    onCommit={onCommit}
                    onRegisterRef={onRegisterRef}
                    onNavigate={onNavigate}
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
  );
}
