"use client";

import { ApiError } from "@newsekolah/api-client";
import { useMediaQuery, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useUnsavedChangesProtection } from "../../../lib/navigation/use-unsaved-changes-protection";
import {
  type AssessmentComponent,
  type Gradebook,
  type GradebookStudent,
  useSaveComponentScoresMutation,
} from "../api";

import { GradebookDesktopTable } from "./gradebook-desktop-table";
import { GradebookMobileCards } from "./gradebook-mobile-cards";
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
 * saving any of them; "Simpan" on one column only sends that column's
 * entries and clears its buffer once the server confirms.
 *
 * Renders exactly one of the desktop table or the mobile card list (picked
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
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const saveScores = useSaveComponentScoresMutation();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [edits, setEdits] = useState<Edits>({});
  const [savingComponentId, setSavingComponentId] = useState<string | null>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const pendingChanges = useMemo(
    () => Object.values(edits).reduce((count, column) => count + Object.keys(column).length, 0),
    [edits],
  );
  useUnsavedChangesProtection(pendingChanges > 0, t("discardChanges"));
  useEffect(() => {
    onPendingChangesChange?.(pendingChanges);
    return () => onPendingChangesChange?.(0);
  }, [onPendingChangesChange, pendingChanges]);

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
    (componentId: string, rowIndex: number, direction: "down" | "up") => {
      const nextIndex = direction === "down" ? rowIndex + 1 : rowIndex - 1;
      inputRefs.current.get(`${componentId}:${nextIndex}`)?.focus();
    },
    [],
  );

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
      const savedStudentIds = new Set(entries.map((entry) => entry.student_user_id));
      setEdits((prev) => {
        const latestColumn = prev[componentId] ?? {};
        const nextColumn = Object.fromEntries(
          Object.entries(latestColumn).filter(
            ([studentId, value]) =>
              !savedStudentIds.has(studentId) || value !== columnEdits[studentId],
          ),
        );
        return { ...prev, [componentId]: nextColumn };
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
      {pendingChanges > 0 && (
        <p className="text-[13px] text-fg-muted" aria-live="polite">
          {t("unsavedChanges", { count: pendingChanges })}
        </p>
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
          onEditComponent={onEditComponent}
          onManualOverride={onManualOverride}
          onGiveStar={onGiveStar}
          onSaveColumn={(componentId) => {
            void saveColumn(componentId);
          }}
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
          savingComponentId={savingComponentId}
          starBalances={starBalances}
          onManualOverride={onManualOverride}
          onGiveStar={onGiveStar}
          onSaveColumn={(componentId) => {
            void saveColumn(componentId);
          }}
          onCommit={commitCell}
          onRegisterRef={registerInputRef}
        />
      )}
    </>
  );
}
