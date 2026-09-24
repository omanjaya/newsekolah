"use client";

import { formatTime, type Locale } from "@newsekolah/i18n";
import { Alert, Button, StickySaveBar, useMediaQuery } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useUnsavedChangesProtection } from "../../../lib/navigation/use-unsaved-changes-protection";
import { useSession } from "../../../lib/session/session-provider";
import type { AssessmentComponent, Gradebook, GradebookStudent } from "../api";
import {
  clearGradebookDraft,
  loadGradebookDraft,
  saveGradebookDraft,
} from "../lib/gradebook-draft";
import { isMultiCellPaste } from "../lib/gradebook-paste";
import {
  computeLiveAverage,
  countMissingComponents,
  countMissingForComponent,
  isScoreOutOfRange,
  mergeStudentScores,
} from "../lib/gradebook-scores";
import { useGradebookSave } from "../lib/use-gradebook-save";

import { GradebookDesktopTable } from "./gradebook-desktop-table";
import { GradebookEntryModeToggle, type GradebookEntryMode } from "./gradebook-entry-mode-toggle";
import { GradebookMobileCards } from "./gradebook-mobile-cards";
import { GradebookMobileComponentEntry } from "./gradebook-mobile-component-entry";
import type { Edits } from "./gradebook-types";

export interface GradebookTableProps {
  sheet: Gradebook;
  canManage: boolean;
  search: string;
  onEditComponent: (component: AssessmentComponent) => void;
  onManualOverride: (student: GradebookStudent) => void;
  starBalances: Map<string, number>;
  onGiveStar: (student: GradebookStudent) => void;
  onPendingChangesChange?: (count: number) => void;
}

/**
 * The score grid: components as columns, students as rows. Each column
 * keeps its own edit buffer so a teacher can fill several columns before
 * saving any of them; the sticky bottom bar's "Simpan semua" is the one
 * primary way to save, sending every changed column in one pass
 * (`../lib/use-gradebook-save.ts`) -- a column can still be saved on its
 * own from its "..." menu (`GradebookColumnMenu`) when that is genuinely
 * useful, but that is not a second permanent save button competing with
 * the bar.
 *
 * Renders exactly one of the desktop table or a mobile entry mode (picked
 * by `useMediaQuery`, not both behind `hidden`/`md:hidden` CSS), and each
 * score cell owns its own typing state (`GradebookScoreCell`) that commits
 * into `edits` debounced instead of on every keystroke -- otherwise a class
 * of 36 students times 8 components is 288+ controlled inputs re-rendered
 * on every character typed into any one of them.
 */
export function GradebookTable({
  sheet,
  canManage,
  search,
  onEditComponent,
  onManualOverride,
  starBalances,
  onGiveStar,
  onPendingChangesChange,
}: GradebookTableProps): ReactElement {
  const t = useTranslations("app.grading.table");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [edits, setEdits] = useState<Edits>({});
  const [entryMode, setEntryMode] = useState<GradebookEntryMode>("component");
  const [draftOffer, setDraftOffer] = useState<{ savedAt: string } | null>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());

  const sheetKey = `${sheet.class_id}:${sheet.subject_id}:${sheet.term_id}`;
  const { savingComponentId, savingAll, saveColumn, saveAll } = useGradebookSave(
    sheetKey,
    edits,
    setEdits,
  );

  const pendingChanges = useMemo(
    () => Object.values(edits).reduce((count, column) => count + Object.keys(column).length, 0),
    [edits],
  );
  useUnsavedChangesProtection(pendingChanges > 0, t("discardChanges"));
  useEffect(() => {
    onPendingChangesChange?.(pendingChanges);
    return () => onPendingChangesChange?.(0);
  }, [onPendingChangesChange, pendingChanges]);

  // Offer to restore an in-progress draft the browser still has from
  // before a reload or a dropped connection, once per sheet.
  useEffect(() => {
    const draft = loadGradebookDraft(sheetKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors attendance/components/session-editor.tsx's own draft-offer effect.
    if (draft && Object.keys(draft.edits).length > 0) setDraftOffer({ savedAt: draft.savedAt });
  }, [sheetKey]);

  // Mirrors every edit to localStorage (try/catch inside the helper) so a
  // dropped classroom connection or an accidental reload does not throw
  // away work still only in the local buffer.
  useEffect(() => {
    if (pendingChanges === 0) return;
    saveGradebookDraft(sheetKey, edits);
  }, [sheetKey, edits, pendingChanges]);

  function restoreDraft() {
    const draft = loadGradebookDraft(sheetKey);
    if (!draft) return;
    setEdits((prev) => {
      const next: Edits = { ...prev };
      for (const [componentId, byStudent] of Object.entries(draft.edits)) {
        next[componentId] = { ...next[componentId], ...byStudent };
      }
      return next;
    });
    setDraftOffer(null);
  }

  function dismissDraft() {
    clearGradebookDraft(sheetKey);
    setDraftOffer(null);
  }

  const components = useMemo(
    () => [...sheet.components].sort((a, b) => a.sequence - b.sequence),
    [sheet.components],
  );
  const students = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? sheet.students.filter((s) => s.name.toLowerCase().includes(q)) : sheet.students;
  }, [sheet.students, search]);

  // Which component the mobile "one at a time" mode is showing. Derived at
  // render (not synced back with an effect) so a component that gets
  // deleted or filtered out never leaves this pointed at a stale id.
  const [rawActiveComponentId, setRawActiveComponentId] = useState<string>("");
  const activeComponentId = components.some((c) => c.id === rawActiveComponentId)
    ? rawActiveComponentId
    : (components[0]?.id ?? "");

  function cellValue(componentId: string, student: GradebookStudent): string {
    const edited = edits[componentId]?.[student.student_user_id];
    if (edited !== undefined) return edited;
    const original = student.scores[componentId];
    return original === undefined ? "" : String(original);
  }

  // Live, edit-aware view of every visible student's merged scores, average
  // and missing-component count -- recomputed from `edits` on every
  // keystroke rather than waiting for a save, so "Rata-rata" and the
  // missing count move as the teacher types (docs brief: "averages / nilai
  // rapor live, nilai kosong jelas").
  const liveByStudent = useMemo(() => {
    const map = new Map<string, { average: number | undefined; missing: number }>();
    for (const student of students) {
      const scores = mergeStudentScores(student, edits);
      map.set(student.student_user_id, {
        average: computeLiveAverage(components, scores),
        missing: countMissingComponents(components, scores),
      });
    }
    return map;
  }, [students, components, edits]);

  const missingByComponent = useMemo(() => {
    const map = new Map<string, number>();
    for (const component of components) {
      map.set(component.id, countMissingForComponent(component.id, students, edits));
    }
    return map;
  }, [components, students, edits]);

  // Students with at least one pending (unsaved) score edit -- the report
  // score shown for them is the server's last-saved value, which will
  // change once these edits are saved, so the row gets a small "will
  // update on save" hint instead of implying it is already current.
  const pendingStudentIds = useMemo(() => {
    const set = new Set<string>();
    for (const byStudent of Object.values(edits)) {
      for (const studentId of Object.keys(byStudent)) set.add(studentId);
    }
    return set;
  }, [edits]);

  // Every pending edit outside the tenant's grading scale, in row-major
  // order (student, then component) so "the first invalid cell" the save
  // bar can jump to is the one nearest the top of the sheet, not whatever
  // order `edits` happens to iterate in.
  const invalidCells = useMemo(() => {
    const list: { componentId: string; studentId: string }[] = [];
    for (const student of students) {
      for (const component of components) {
        const value = edits[component.id]?.[student.student_user_id];
        if (value !== undefined && isScoreOutOfRange(value, sheet.scale.min, sheet.scale.max)) {
          list.push({ componentId: component.id, studentId: student.student_user_id });
        }
      }
    }
    return list;
  }, [students, components, edits, sheet.scale.min, sheet.scale.max]);
  const invalidComponentIds = useMemo(
    () => new Set(invalidCells.map((cell) => cell.componentId)),
    [invalidCells],
  );
  const hasInvalidEdits = invalidCells.length > 0;
  const rangeHint = t("scoreRangeHint", { min: sheet.scale.min, max: sheet.scale.max });

  // Stable identities (functional state updates, no closed-over deps) so
  // `GradebookScoreCell`'s memo actually bails out for cells the teacher
  // did not just touch.
  const commitCell = useCallback((componentId: string, studentId: string, value: string) => {
    setEdits((prev) => ({
      ...prev,
      [componentId]: { ...prev[componentId], [studentId]: value },
    }));
  }, []);
  const registerInputRef = useCallback((refKey: string, el: HTMLInputElement | null) => {
    if (el) inputRefs.current.set(refKey, el);
    else inputRefs.current.delete(refKey);
  }, []);
  const handleNavigate = useCallback(
    (componentId: string, rowIndex: number, direction: "up" | "down" | "left" | "right") => {
      if (direction === "down" || direction === "up") {
        const nextIndex = direction === "down" ? rowIndex + 1 : rowIndex - 1;
        inputRefs.current.get(`${componentId}:${nextIndex}`)?.focus();
        return;
      }
      const componentIndex = components.findIndex((c) => c.id === componentId);
      if (componentIndex === -1) return;
      const nextComponentIndex = direction === "right" ? componentIndex + 1 : componentIndex - 1;
      const nextComponent = components[nextComponentIndex];
      if (!nextComponent) return;
      inputRefs.current.get(`${nextComponent.id}:${rowIndex}`)?.focus();
    },
    [components],
  );
  const handlePasteBlock = useCallback(
    (componentId: string, studentId: string, rows: string[][]) => {
      if (!isMultiCellPaste(rows)) return;
      const componentIndex = components.findIndex((c) => c.id === componentId);
      const studentIndex = students.findIndex((s) => s.student_user_id === studentId);
      if (componentIndex === -1 || studentIndex === -1) return;
      setEdits((prev) => {
        const next: Edits = { ...prev };
        rows.forEach((rowValues, rOffset) => {
          const student = students[studentIndex + rOffset];
          if (!student) return;
          rowValues.forEach((rawValue, cOffset) => {
            const component = components[componentIndex + cOffset];
            if (!component) return;
            next[component.id] = {
              ...next[component.id],
              [student.student_user_id]: rawValue.trim(),
            };
          });
        });
        return next;
      });
    },
    [components, students],
  );

  // Jumps to (and focuses) the first invalid cell, for the save bar's "N
  // nilai tidak valid" hint. On the mobile "one component at a time" mode
  // that cell's input may not even be mounted yet if it belongs to a
  // component the teacher isn't currently looking at -- switch to it first,
  // then focus once the next paint has mounted it.
  function focusFirstInvalidCell() {
    const first = invalidCells[0];
    if (!first) return;
    const rowIndex = students.findIndex((s) => s.student_user_id === first.studentId);
    if (rowIndex === -1) return;
    const refKey = `${first.componentId}:${rowIndex}`;
    const existing = inputRefs.current.get(refKey);
    if (existing) {
      existing.focus();
      return;
    }
    setEntryMode("component");
    setRawActiveComponentId(first.componentId);
    requestAnimationFrame(() => {
      inputRefs.current.get(refKey)?.focus();
    });
  }

  if (components.length === 0) {
    return <p className="p-6 text-center text-[13px] text-fg-muted">{t("noComponents")}</p>;
  }

  return (
    <>
      {draftOffer && (
        <Alert variant="warning" title={t("draftFoundTitle")}>
          <p>
            {t("draftFoundBody", {
              time: formatTime(draftOffer.savedAt, { locale, timeZone: me?.tenant.timezone }),
            })}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={restoreDraft}>
              {t("draftRestore")}
            </Button>
            <Button size="sm" variant="secondary" onClick={dismissDraft}>
              {t("draftDismiss")}
            </Button>
          </div>
        </Alert>
      )}

      {isDesktop ? (
        <GradebookDesktopTable
          t={t}
          components={components}
          students={students}
          canManage={canManage}
          edits={edits}
          cellValue={cellValue}
          savingComponentId={savingComponentId}
          starBalances={starBalances}
          scaleMin={sheet.scale.min}
          scaleMax={sheet.scale.max}
          rangeHint={rangeHint}
          liveByStudent={liveByStudent}
          missingByComponent={missingByComponent}
          invalidComponentIds={invalidComponentIds}
          pendingStudentIds={pendingStudentIds}
          onEditComponent={onEditComponent}
          onManualOverride={onManualOverride}
          onGiveStar={onGiveStar}
          onSaveColumn={saveColumn}
          onCommit={commitCell}
          onRegisterRef={registerInputRef}
          onNavigate={handleNavigate}
          onPasteBlock={handlePasteBlock}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {canManage && (
            <GradebookEntryModeToggle t={t} mode={entryMode} onModeChange={setEntryMode} />
          )}
          {entryMode === "component" && canManage ? (
            <GradebookMobileComponentEntry
              t={t}
              components={components}
              students={students}
              edits={edits}
              cellValue={cellValue}
              savingComponentId={savingComponentId}
              scaleMin={sheet.scale.min}
              scaleMax={sheet.scale.max}
              rangeHint={rangeHint}
              missingByComponent={missingByComponent}
              invalidComponentIds={invalidComponentIds}
              activeComponentId={activeComponentId}
              onActiveComponentChange={setRawActiveComponentId}
              onSaveColumn={saveColumn}
              onCommit={commitCell}
              onRegisterRef={registerInputRef}
              onNavigate={handleNavigate}
            />
          ) : (
            <GradebookMobileCards
              t={t}
              components={components}
              students={students}
              canManage={canManage}
              edits={edits}
              cellValue={cellValue}
              starBalances={starBalances}
              scaleMin={sheet.scale.min}
              scaleMax={sheet.scale.max}
              rangeHint={rangeHint}
              liveByStudent={liveByStudent}
              pendingStudentIds={pendingStudentIds}
              onManualOverride={onManualOverride}
              onGiveStar={onGiveStar}
              onCommit={commitCell}
              onRegisterRef={registerInputRef}
            />
          )}
        </div>
      )}

      {canManage && (
        <StickySaveBar
          leadingSlot={
            <span className="text-[13px] text-fg-muted" aria-live="polite">
              {pendingChanges > 0 ? t("unsavedChanges", { count: pendingChanges }) : t("saveHint")}
            </span>
          }
          trailingSlot={
            hasInvalidEdits ? (
              <span role="alert" className="flex items-center gap-2 text-[13px] text-status-absent">
                {t("invalidCount", { count: invalidCells.length })}
                <button
                  type="button"
                  className="font-medium underline"
                  onClick={focusFirstInvalidCell}
                >
                  {t("invalidFocus")}
                </button>
              </span>
            ) : undefined
          }
          saveLabel={t("saveAll")}
          saving={savingAll}
          disabled={pendingChanges === 0 || hasInvalidEdits}
          onSave={saveAll}
        />
      )}
    </>
  );
}
