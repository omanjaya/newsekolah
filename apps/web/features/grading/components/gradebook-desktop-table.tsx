"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from "@newsekolah/ui";
import { Star } from "lucide-react";
import type { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { AssessmentComponent, GradebookStudent } from "../api";

import { GradebookColumnMenu } from "./gradebook-column-menu";
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
  scaleMin: number;
  scaleMax: number;
  /** "Nilai {min}-{max}", precomputed once and reused on every out-of-range cell's inline hint. */
  rangeHint: string;
  liveByStudent: Map<string, { average: number | undefined; missing: number }>;
  missingByComponent: Map<string, number>;
  invalidComponentIds: Set<string>;
  pendingStudentIds: Set<string>;
  onEditComponent: (component: AssessmentComponent) => void;
  onManualOverride: (student: GradebookStudent) => void;
  onGiveStar: (student: GradebookStudent) => void;
  onSaveColumn: (componentId: string) => void;
  onCommit: (componentId: string, studentId: string, value: string) => void;
  onRegisterRef: (refKey: string, el: HTMLInputElement | null) => void;
  onNavigate: (
    componentId: string,
    rowIndex: number,
    direction: "up" | "down" | "left" | "right",
  ) => void;
  onPasteBlock: (componentId: string, studentId: string, rows: string[][]) => void;
}

/**
 * The score matrix as a table: components as columns, students as rows.
 * Desktop/tablet only. Arrow keys move the focused cell in all four
 * directions (Tab already reaches the next cell in reading order for
 * free, since each row's inputs sit in DOM order), and pasting a copied
 * Excel range fills the block starting at the focused cell.
 *
 * Each column's own save action lives in its "..." menu
 * (`GradebookColumnMenu`), not as a standalone button sitting in every
 * header at once -- the sticky bottom bar already saves every changed
 * column in one tap, so a permanently visible per-column button duplicated
 * that action five, six, seven times over.
 *
 * Uses the shared `Table` primitive's `density="compact"`: this is a dense
 * editable grid (one narrow score input per student per component, often
 * many components wide), and the comfortable `normal` density's taller rows
 * and wider padding would push most of it out of view without adding any
 * legibility -- the input's own sizing already carries the row height.
 */
export function GradebookDesktopTable({
  t,
  components,
  students,
  canManage,
  edits,
  cellValue,
  savingComponentId,
  starBalances,
  scaleMin,
  scaleMax,
  rangeHint,
  liveByStudent,
  missingByComponent,
  invalidComponentIds,
  pendingStudentIds,
  onEditComponent,
  onManualOverride,
  onGiveStar,
  onSaveColumn,
  onCommit,
  onRegisterRef,
  onNavigate,
  onPasteBlock,
}: GradebookDesktopTableProps): ReactElement {
  return (
    <Table density="compact" className="min-w-[720px] border-collapse">
      <TableHeader>
        <TableRow>
          <TableHead scope="col" className="sticky left-0 z-10 min-w-48 bg-bg">
            {t("studentColumn")}
          </TableHead>
          {components.map((component) => {
            const missing = missingByComponent.get(component.id) ?? 0;
            const hasInvalid = invalidComponentIds.has(component.id);
            return (
              <TableHead
                key={component.id}
                scope="col"
                className="border-l border-line px-2 align-top font-medium"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <span className="text-fg">{component.code}</span>
                    {canManage && (
                      <GradebookColumnMenu
                        t={t}
                        code={component.code}
                        hasEdits={Object.keys(edits[component.id] ?? {}).length > 0}
                        saving={savingComponentId === component.id}
                        disabled={hasInvalid}
                        onEditComponent={() => {
                          onEditComponent(component);
                        }}
                        onSaveColumn={() => {
                          onSaveColumn(component.id);
                        }}
                      />
                    )}
                  </div>
                  <span className="text-[12px] font-normal text-fg-muted">
                    {t("weightLabel", { weight: component.weight })}
                    {component.kktp !== undefined ? ` · KKTP ${component.kktp}` : ""}
                  </span>
                  {missing > 0 && (
                    <span className="text-[12px] font-normal text-fg-muted">
                      {t("missingCount", { count: missing })}
                    </span>
                  )}
                </div>
              </TableHead>
            );
          })}
          <TableHead scope="col" className="border-l border-line text-right font-medium">
            {t("averageColumn")}
          </TableHead>
          <TableHead scope="col" className="border-l border-line text-right font-medium">
            {t("reportScoreColumn")}
          </TableHead>
          <TableHead scope="col" className="border-l border-line font-medium">
            {t("starsColumn")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((student, rowIndex) => {
          const live = liveByStudent.get(student.student_user_id);
          const pending = pendingStudentIds.has(student.student_user_id);
          return (
            <TableRow key={student.student_user_id}>
              <TableHead
                scope="row"
                className="sticky left-0 z-10 bg-surface text-left text-[13px] font-normal text-fg"
              >
                {student.name}
              </TableHead>
              {components.map((component) => (
                <TableCell key={component.id} className="border-l border-line px-2 py-1.5">
                  <GradebookScoreCell
                    studentId={student.student_user_id}
                    componentId={component.id}
                    rowIndex={rowIndex}
                    value={cellValue(component.id, student)}
                    disabled={!canManage}
                    ariaLabel={t("scoreFor", { name: student.name, code: component.code })}
                    className="w-20 text-right [font-variant-numeric:tabular-nums]"
                    min={scaleMin}
                    max={scaleMax}
                    rangeHint={rangeHint}
                    changed={edits[component.id]?.[student.student_user_id] !== undefined}
                    onCommit={onCommit}
                    onRegisterRef={onRegisterRef}
                    onNavigate={onNavigate}
                    onPasteBlock={onPasteBlock}
                  />
                </TableCell>
              ))}
              <TableCell className="border-l border-line text-right text-fg [font-variant-numeric:tabular-nums]">
                {live?.average !== undefined ? live.average.toFixed(1) : "-"}
              </TableCell>
              <TableCell className="border-l border-line text-right [font-variant-numeric:tabular-nums]">
                <button
                  type="button"
                  disabled={!canManage}
                  onClick={() => {
                    onManualOverride(student);
                  }}
                  title={pending ? t("reportScorePending") : undefined}
                  className={cn(
                    "font-medium text-fg underline decoration-dotted underline-offset-2",
                    !canManage && "no-underline",
                  )}
                >
                  {student.report_score !== undefined ? student.report_score.toFixed(1) : "-"}
                </button>
                {pending && (
                  <span
                    className="ml-1 inline-block size-1.5 rounded-full bg-accent align-middle"
                    aria-label={t("reportScorePending")}
                    title={t("reportScorePending")}
                  />
                )}
              </TableCell>
              <TableCell className="border-l border-line">
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
              </TableCell>
            </TableRow>
          );
        })}
        {students.length === 0 && (
          <TableRow>
            <TableCell colSpan={components.length + 3} className="py-6 text-center text-fg-muted">
              {t("noMatch")}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
