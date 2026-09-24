"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatTime, type Locale } from "@newsekolah/i18n";
import { useToast } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import { useState, type Dispatch, type SetStateAction } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { type ScoreEntry, useSaveComponentScoresMutation } from "../api";
import type { Edits } from "../components/gradebook-types";

import { clearGradebookDraft } from "./gradebook-draft";

export interface UseGradebookSave {
  savingComponentId: string | null;
  savingAll: boolean;
  saveColumn: (componentId: string) => void;
  saveAll: () => void;
}

/**
 * Saving one gradebook sheet's edits, per column or all pending columns at
 * once. Split out of `GradebookTable` (whose own concern is the grid's
 * layout and navigation, not the save call, its retry toast, or clearing
 * the local draft once nothing is left pending).
 */
export function useGradebookSave(
  sheetKey: string,
  edits: Edits,
  setEdits: Dispatch<SetStateAction<Edits>>,
): UseGradebookSave {
  const t = useTranslations("app.grading.table");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const saveScores = useSaveComponentScoresMutation();
  const [savingComponentId, setSavingComponentId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  /** Returns whether it actually sent anything (an empty or all-blank column sends nothing). */
  async function saveComponentColumn(componentId: string): Promise<boolean> {
    const columnEdits = edits[componentId];
    if (!columnEdits) return false;
    const entries: ScoreEntry[] = Object.entries(columnEdits)
      .filter(([, value]) => value.trim() !== "")
      .map(([student_user_id, value]) => ({ student_user_id, score: Number(value) }))
      .filter((entry) => Number.isFinite(entry.score));
    if (entries.length === 0) return false;
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
    return true;
  }

  function savedToast() {
    toast.success(
      t("scoresSaved", { time: formatTime(new Date(), { locale, timeZone: me?.tenant.timezone }) }),
    );
  }

  function saveColumn(componentId: string) {
    void (async () => {
      setSavingComponentId(componentId);
      try {
        const saved = await saveComponentColumn(componentId);
        if (saved) {
          savedToast();
          const remainingAfter =
            Object.values(edits).reduce((count, column) => count + Object.keys(column).length, 0) -
            Object.keys(edits[componentId] ?? {}).length;
          if (remainingAfter <= 0) clearGradebookDraft(sheetKey);
        }
      } catch (error) {
        toast.error(
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          {
            retry: {
              label: t("retry"),
              onClick: () => {
                saveColumn(componentId);
              },
            },
          },
        );
      } finally {
        setSavingComponentId(null);
      }
    })();
  }

  function saveAll() {
    void (async () => {
      setSavingAll(true);
      try {
        const componentIds = Object.keys(edits).filter(
          (id) => Object.keys(edits[id] ?? {}).length > 0,
        );
        let savedAny = false;
        for (const componentId of componentIds) {
          const saved = await saveComponentColumn(componentId);
          savedAny = savedAny || saved;
        }
        if (savedAny) {
          savedToast();
          clearGradebookDraft(sheetKey);
        }
      } catch (error) {
        toast.error(
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          {
            retry: {
              label: t("retry"),
              onClick: () => {
                saveAll();
              },
            },
          },
        );
      } finally {
        setSavingAll(false);
      }
    })();
  }

  return { savingComponentId, savingAll, saveColumn, saveAll };
}
