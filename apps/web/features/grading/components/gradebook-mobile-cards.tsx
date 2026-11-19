"use client";

import {
  Button,
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
  List,
  ListRow,
} from "@newsekolah/ui";
import { useLocale, type useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { AssessmentComponent, GradebookStudent } from "../api";
import { formatScore } from "../lib/format-score";
import { type StarBalances, starBalanceLabel } from "../lib/star-balances";

import { GradebookScoreCell } from "./gradebook-score-cell";
import { GradebookStarBalance } from "./gradebook-star-balance";
import type { Edits } from "./gradebook-types";

export interface GradebookMobileCardsProps {
  t: ReturnType<typeof useTranslations>;
  components: AssessmentComponent[];
  students: GradebookStudent[];
  canManage: boolean;
  edits: Edits;
  cellValue: (componentId: string, student: GradebookStudent) => string;
  starBalances: StarBalances;
  scaleMin: number;
  scaleMax: number;
  rangeHint: string;
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
  rangeHint,
  liveByStudent,
  pendingStudentIds,
  onManualOverride,
  onGiveStar,
  onCommit,
  onRegisterRef,
}: GradebookMobileCardsProps): ReactElement {
  const locale = useLocale();
  if (students.length === 0) {
    return <EmptyState variant="compact" title={t("noMatch")} />;
  }
  return (
    <div className="flex flex-col gap-3">
      {students.map((student, rowIndex) => {
        const live = liveByStudent.get(student.student_user_id);
        const pending = pendingStudentIds.has(student.student_user_id);
        const reportScore =
          student.report_score !== undefined ? formatScore(student.report_score, locale) : "-";
        return (
          <Card key={student.student_user_id}>
            <CardHeader
              action={
                <GradebookStarBalance
                  t={t}
                  studentName={student.name}
                  label={starBalanceLabel(starBalances, student.student_user_id)}
                  canManage={canManage}
                  onOpen={() => {
                    onGiveStar(student);
                  }}
                />
              }
            >
              <CardTitle className="truncate">{student.name}</CardTitle>
            </CardHeader>
            <List>
              {components.map((component) => {
                const changed = edits[component.id]?.[student.student_user_id] !== undefined;
                return (
                  <ListRow
                    key={component.id}
                    title={component.code}
                    meta={[
                      t("weightLabel", { weight: component.weight }),
                      component.kktp !== undefined
                        ? t("kktpLabel", { kktp: component.kktp })
                        : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    action={
                      <GradebookScoreCell
                        studentId={student.student_user_id}
                        componentId={component.id}
                        rowIndex={rowIndex}
                        value={cellValue(component.id, student)}
                        readOnly={!canManage}
                        ariaLabel={t("scoreFor", { name: student.name, code: component.code })}
                        className="w-20 shrink-0 text-right tabular-nums"
                        min={scaleMin}
                        max={scaleMax}
                        rangeHint={rangeHint}
                        changed={changed}
                        onCommit={onCommit}
                        onRegisterRef={onRegisterRef}
                      />
                    }
                  />
                );
              })}
            </List>
            <CardFooter className="justify-between gap-3 border-t border-line py-2 text-body-sm">
              <span className="text-fg-muted tabular-nums">
                {t("averageColumn")}{" "}
                {live?.average !== undefined ? formatScore(live.average, locale) : "-"}
              </span>
              {canManage ? (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    onManualOverride(student);
                  }}
                  className="text-fg underline decoration-dotted underline-offset-2"
                >
                  {t("reportScoreColumn")} {reportScore}
                  {pending && (
                    <span
                      role="img"
                      className="ml-1 inline-block size-1.5 rounded-full bg-accent"
                      aria-label={t("reportScorePending")}
                    />
                  )}
                </Button>
              ) : (
                <span className="text-label text-fg">
                  {t("reportScoreColumn")} {reportScore}
                </span>
              )}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
