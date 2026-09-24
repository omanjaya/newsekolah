"use client";

import { Button, cn } from "@newsekolah/ui";
import type { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { AssessmentComponent, GradebookStudent } from "../api";

import { GradebookScoreCell } from "./gradebook-score-cell";
import type { Edits } from "./gradebook-types";

export interface GradebookMobileComponentEntryProps {
  t: ReturnType<typeof useTranslations>;
  components: AssessmentComponent[];
  students: GradebookStudent[];
  edits: Edits;
  cellValue: (componentId: string, student: GradebookStudent) => string;
  savingComponentId: string | null;
  scaleMin: number;
  scaleMax: number;
  rangeHint: string;
  missingByComponent: Map<string, number>;
  invalidComponentIds: Set<string>;
  activeComponentId: string;
  onActiveComponentChange: (componentId: string) => void;
  onSaveColumn: (componentId: string) => void;
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
 * another. Switching component is a horizontally scrollable chip row (the
 * same interaction `AttendanceStatusFilterChips` uses for the roster's
 * status filter), each chip carrying its own missing-score count so a
 * teacher can see which column still needs work without opening it.
 */
export function GradebookMobileComponentEntry({
  t,
  components,
  students,
  edits,
  cellValue,
  savingComponentId,
  scaleMin,
  scaleMax,
  rangeHint,
  missingByComponent,
  invalidComponentIds,
  activeComponentId,
  onActiveComponentChange,
  onSaveColumn,
  onCommit,
  onRegisterRef,
  onNavigate,
}: GradebookMobileComponentEntryProps): ReactElement {
  const active = components.find((c) => c.id === activeComponentId) ?? components[0];
  if (!active)
    return <p className="p-6 text-center text-[13px] text-fg-muted">{t("noComponents")}</p>;

  const missing = missingByComponent.get(active.id) ?? 0;
  const hasInvalid = invalidComponentIds.has(active.id);
  const hasEdits = Object.keys(edits[active.id] ?? {}).length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label={t("entryMode.componentPicker")}
        className={cn(
          "flex snap-x snap-mandatory gap-2 overflow-x-auto py-0.5",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {components.map((component) => {
          const componentMissing = missingByComponent.get(component.id) ?? 0;
          const selected = component.id === active.id;
          // The visible chip stays compact ("TG1 5"), but that bare number
          // is ambiguous out of context (how many were entered? how many
          // points?) -- the accessible name always spells it out, and a
          // sighted user gets the same "kosong" word via the tooltip.
          const missingLabel =
            componentMissing > 0 ? t("missingCount", { count: componentMissing }) : "";
          return (
            <button
              key={component.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={
                componentMissing > 0 ? `${component.code}, ${missingLabel}` : component.code
              }
              title={componentMissing > 0 ? missingLabel : undefined}
              onClick={() => {
                onActiveComponentChange(component.id);
              }}
              className={cn(
                "flex min-h-9 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
                selected
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border text-fg-muted hover:bg-bg",
              )}
            >
              <span aria-hidden="true">{component.code}</span>
              {componentMissing > 0 && (
                <span
                  aria-hidden="true"
                  className="rounded-full bg-status-absent/15 px-1.5 py-0.5 text-[11px] tabular-nums text-status-absent"
                >
                  {componentMissing}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface p-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-fg">{active.code}</p>
          <p className="text-[12px] text-fg-muted">
            {t("weightLabel", { weight: active.weight })}
            {active.kktp !== undefined ? ` · KKTP ${active.kktp}` : ""}
            {missing > 0 ? ` · ${t("missingCount", { count: missing })}` : ""}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={savingComponentId === active.id}
          disabled={!hasEdits || hasInvalid}
          onClick={() => {
            onSaveColumn(active.id);
          }}
        >
          {t("saveColumn")}
        </Button>
      </div>

      <ul className="flex flex-col divide-y divide-border rounded-sm border border-border bg-surface">
        {students.map((student, rowIndex) => {
          const changed = edits[active.id]?.[student.student_user_id] !== undefined;
          return (
            <li
              key={student.student_user_id}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <span className="flex min-w-0 items-center gap-1.5 text-[14px] text-fg">
                <span className="truncate">{student.name}</span>
                {changed && (
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-accent"
                    aria-label={t("rowChanged")}
                  />
                )}
              </span>
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
            </li>
          );
        })}
        {students.length === 0 && (
          <li className="px-3 py-6 text-center text-[13px] text-fg-muted">{t("noMatch")}</li>
        )}
      </ul>
    </div>
  );
}
