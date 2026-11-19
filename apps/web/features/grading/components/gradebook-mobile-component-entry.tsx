"use client";

import { IconButton, List, ListRow, SegmentedControl } from "@newsekolah/ui";
import { Plus } from "lucide-react";
import type { useTranslations } from "next-intl";
import { useId, type ReactElement } from "react";

import type { AssessmentComponent, GradebookStudent } from "../api";

import { GradebookScoreCell } from "./gradebook-score-cell";
import type { Edits } from "./gradebook-types";

export interface GradebookMobileComponentEntryProps {
  t: ReturnType<typeof useTranslations>;
  components: AssessmentComponent[];
  students: GradebookStudent[];
  edits: Edits;
  cellValue: (componentId: string, student: GradebookStudent) => string;
  scaleMin: number;
  scaleMax: number;
  rangeHint: string;
  missingByComponent: Map<string, number>;
  activeComponentId: string;
  onActiveComponentChange: (componentId: string) => void;
  /** Opens the new-component dialog: a component is added where components are picked. */
  onAddComponent: () => void;
  onCommit: (componentId: string, studentId: string, value: string) => void;
  onRegisterRef: (refKey: string, el: HTMLInputElement | null) => void;
  onNavigate: (
    componentId: string,
    rowIndex: number,
    direction: "up" | "down" | "left" | "right",
  ) => void;
}

/**
 * The phone's fast-entry mode: one assessment component at a time, every
 * student stacked below it with one big score input each -- the mobile
 * equivalent of filling a spreadsheet column, for a teacher standing in
 * front of the class scoring 36 students on the same quiz one after
 * another. The component picker is a segmented control whose count shows
 * how many scores each component still misses; the caption under it names
 * that number for the active component, each segment is named with it
 * ("TG1, 2 kosong") and the picker's description lists it for every
 * component, so a screen reader never hears a bare "TG1 2".
 * Saving goes through the sticky bar alone, so there is one way to save
 * on a phone.
 */
export function GradebookMobileComponentEntry({
  t,
  components,
  students,
  edits,
  cellValue,
  scaleMin,
  scaleMax,
  rangeHint,
  missingByComponent,
  activeComponentId,
  onActiveComponentChange,
  onAddComponent,
  onCommit,
  onRegisterRef,
  onNavigate,
}: GradebookMobileComponentEntryProps): ReactElement {
  const missingSummaryId = useId();
  const active = components.find((c) => c.id === activeComponentId) ?? components[0];
  if (!active)
    return <p className="p-6 text-center text-body-sm text-fg-muted">{t("noComponents")}</p>;

  const missing = missingByComponent.get(active.id) ?? 0;
  const details = [
    t("weightLabel", { weight: active.weight }),
    active.kktp !== undefined ? t("kktpLabel", { kktp: active.kktp }) : undefined,
    missing > 0 ? t("missingCount", { count: missing }) : undefined,
  ].filter(Boolean);
  const missingSummary = components
    .filter((component) => (missingByComponent.get(component.id) ?? 0) > 0)
    .map(
      (component) =>
        `${component.code}: ${t("missingCount", { count: missingByComponent.get(component.id) ?? 0 })}`,
    )
    .join(", ");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <SegmentedControl
          aria-label={t("entryMode.componentPicker")}
          aria-describedby={missingSummary ? missingSummaryId : undefined}
          value={active.id}
          onValueChange={onActiveComponentChange}
          className="min-w-0"
          options={components.map((component) => {
            const componentMissing = missingByComponent.get(component.id) ?? 0;
            return componentMissing > 0
              ? {
                  value: component.id,
                  label: component.code,
                  count: componentMissing,
                  ariaLabel: `${component.code}, ${t("missingCount", { count: componentMissing })}`,
                }
              : { value: component.id, label: component.code };
          })}
        />
        <IconButton
          icon={<Plus />}
          aria-label={t("addComponent")}
          variant="surface"
          className="ml-auto shrink-0"
          onClick={onAddComponent}
        />
      </div>
      {missingSummary && (
        <span id={missingSummaryId} className="sr-only">
          {t("entryMode.componentPickerMissing", { list: missingSummary })}
        </span>
      )}
      <p className="text-caption text-fg-muted">{details.join(" · ")}</p>

      <List framed aria-label={t("scoresFor", { code: active.code })}>
        {students.map((student, rowIndex) => {
          const changed = edits[active.id]?.[student.student_user_id] !== undefined;
          return (
            <ListRow
              key={student.student_user_id}
              title={student.name}
              meta={changed ? t("rowUnsaved") : undefined}
              action={
                <GradebookScoreCell
                  studentId={student.student_user_id}
                  componentId={active.id}
                  rowIndex={rowIndex}
                  value={cellValue(active.id, student)}
                  disabled={false}
                  ariaLabel={t("scoreFor", { name: student.name, code: active.code })}
                  className="w-24 shrink-0"
                  size="lg"
                  min={scaleMin}
                  max={scaleMax}
                  rangeHint={rangeHint}
                  changed={changed}
                  onCommit={onCommit}
                  onRegisterRef={onRegisterRef}
                  onNavigate={onNavigate}
                />
              }
            />
          );
        })}
        {students.length === 0 && <ListRow title={t("noMatch")} />}
      </List>
    </div>
  );
}
