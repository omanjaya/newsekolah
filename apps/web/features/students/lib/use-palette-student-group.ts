"use client";

import { useDebouncedCallback, type CommandPaletteGroup } from "@newsekolah/ui";
import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { useStudentSearchQuery } from "../api";

import { studentPaletteItems } from "./palette-items";

/** Pause after the last keystroke before the directory is asked. */
export const STUDENT_SEARCH_DEBOUNCE_MS = 300;

/**
 * The palette's "Siswa" group. Typing feeds `onSearchChange`; the term the
 * query sees trails the input by the debounce, so a burst of keystrokes sends
 * one request and every superseded term is cancelled by its query key.
 * `enabled` is the reader's right to open a student profile: without it no
 * request is ever made.
 */
export function usePaletteStudentGroup({
  enabled,
  heading,
  icon,
  onSelect,
}: {
  enabled: boolean;
  heading: string;
  icon: ReactNode;
  onSelect: (studentId: string) => void;
}): {
  group: CommandPaletteGroup | null;
  onSearchChange: (search: string) => void;
  reset: () => void;
} {
  const [term, setTerm] = useState("");
  const debounceTerm = useDebouncedCallback(setTerm, STUDENT_SEARCH_DEBOUNCE_MS);
  const query = useStudentSearchQuery(term, enabled);

  const hits = enabled ? query.data : undefined;
  const group = useMemo<CommandPaletteGroup | null>(() => {
    if (!hits || hits.length === 0) return null;
    return { heading, items: studentPaletteItems(hits, { icon, onSelect }) };
  }, [hits, heading, icon, onSelect]);

  const reset = useCallback(() => {
    setTerm("");
  }, []);

  return { group, onSearchChange: debounceTerm, reset };
}
