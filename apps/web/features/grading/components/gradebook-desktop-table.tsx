"use client";

import {
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@newsekolah/ui";
import { Pencil } from "lucide-react";
import { useLocale, type useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { AssessmentComponent, GradebookStudent } from "../api";
import { formatScore } from "../lib/format-score";
import { type StarBalances, starBalanceLabel } from "../lib/star-balances";

import { GradebookColumnMenu } from "./gradebook-column-menu";
import { GradebookScoreCell } from "./gradebook-score-cell";
import { GradebookStarBalance } from "./gradebook-star-balance";
import type { Edits } from "./gradebook-types";

export interface GradebookDesktopTableProps {
  t: ReturnType<typeof useTranslations>;
  components: AssessmentComponent[];
  students: GradebookStudent[];
  canManage: boolean;
  edits: Edits;
  cellValue: (componentId: string, student: GradebookStudent) => string;
  savingComponentId: string | null;
  starBalances: StarBalances;
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
  const locale = useLocale();
  // The header stays in view while the rows scroll inside the table's own
  // card (the page is as tall as the screen on desktop), so a long class
  // never loses which column is which.
  const stickyHead = "sticky top-0 z-10 bg-surface-header";
  return (
    <Table
      density="compact"
      className="min-w-[720px] border-collapse"
      containerClassName="min-h-0 overflow-auto"
    >
      <TableHeader>
        <TableRow>
          <TableHead scope="col" className={cn(stickyHead, "left-0 z-20 min-w-48")}>
            {t("studentColumn")}
          </TableHead>
          {components.map((component) => {
            const missing = missingByComponent.get(component.id) ?? 0;
            const hasInvalid = invalidComponentIds.has(component.id);
            const weight = t("weightLabel", { weight: component.weight });
            const kktp =
              component.kktp !== undefined ? t("kktpLabel", { kktp: component.kktp }) : undefined;
            const detail = [weight, kktp].filter(Boolean).join(" · ");
            return (
              <TableHead
                key={component.id}
                scope="col"
                className={cn(stickyHead, "w-32 min-w-32 border-l border-line px-2")}
              >
                {/* The code beside its menu, then the weight and, in words,
                    how many scores the column still lacks, across the
                    column's full width (wrapping rather than cut). */}
                <div className="flex flex-col">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-label text-fg" title={detail}>
                      {component.code}
                    </span>
                    {canManage && (
                      // Its 32px target overhangs the code's line instead of
                      // pushing the caption down.
                      <span className="-my-1 ml-auto">
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
                      </span>
                    )}
                  </div>
                  <span
                    className="flex flex-wrap gap-x-1 text-caption font-normal text-fg-muted"
                    title={detail}
                  >
                    <span>{weight}</span>
                    {missing > 0 && (
                      <span className="whitespace-nowrap">
                        · {t("missingCount", { count: missing })}
                      </span>
                    )}
                  </span>
                </div>
              </TableHead>
            );
          })}
          <TableHead scope="col" className={cn(stickyHead, "border-l border-line text-right")}>
            {t("averageColumn")}
          </TableHead>
          <TableHead scope="col" className={cn(stickyHead, "border-l border-line text-right")}>
            {t("reportScoreColumn")}
          </TableHead>
          <TableHead scope="col" className={cn(stickyHead, "border-l border-line")}>
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
                className="sticky left-0 z-1 bg-surface text-left font-normal text-fg"
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
                    readOnly={!canManage}
                    ariaLabel={t("scoreFor", { name: student.name, code: component.code })}
                    className="w-full text-right tabular-nums"
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
              <TableCell className="border-l border-line text-right text-fg tabular-nums">
                {live?.average !== undefined ? formatScore(live.average, locale) : "-"}
              </TableCell>
              <TableCell className="border-l border-line text-right tabular-nums">
                {student.report_score === undefined ? (
                  canManage ? (
                    // Opens the override even without a score yet (a
                    // teacher may set the report score directly): a pencil
                    // with a real hit area and a tooltip, so it never
                    // reads as the plain "-" of an empty cell beside it.
                    <IconButton
                      size="sm"
                      icon={<Pencil />}
                      aria-label={t("reportScoreSet", { name: student.name })}
                      onClick={() => {
                        onManualOverride(student);
                      }}
                      className="text-fg-muted hover:text-fg"
                    />
                  ) : (
                    <span className="text-fg-muted">-</span>
                  )
                ) : canManage ? (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => {
                      onManualOverride(student);
                    }}
                    title={pending ? t("reportScorePending") : undefined}
                    className="text-fg underline decoration-dotted underline-offset-2"
                  >
                    {formatScore(student.report_score, locale)}
                  </Button>
                ) : (
                  <span className="text-label text-fg">
                    {formatScore(student.report_score, locale)}
                  </span>
                )}
                {pending && (
                  <span
                    role="img"
                    className="ml-1 inline-block size-1.5 rounded-full bg-accent align-middle"
                    aria-label={t("reportScorePending")}
                    title={t("reportScorePending")}
                  />
                )}
              </TableCell>
              <TableCell className="border-l border-line">
                <GradebookStarBalance
                  t={t}
                  studentName={student.name}
                  label={starBalanceLabel(starBalances, student.student_user_id)}
                  canManage={canManage}
                  onOpen={() => {
                    onGiveStar(student);
                  }}
                  className={canManage ? "-ml-2 px-2" : undefined}
                />
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
