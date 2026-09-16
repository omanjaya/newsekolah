"use client";

import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback, useState } from "react";

/**
 * DataTable's row selection is an unordered `Record<id, boolean>`, but
 * batch label printing must preserve the order copies were picked in. This
 * tracks that order as state alongside the selection state DataTable
 * expects, updating both together from the same change.
 */
export function useOrderedSelection() {
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [orderedIds, setOrderedIds] = useState<string[]>([]);

  const onSelectionChange = useCallback<
    (updater: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)) => void
  >((updater) => {
    setSelection((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const nextIds = new Set(Object.keys(next).filter((id) => next[id]));
      setOrderedIds((prevOrder) => {
        const kept = prevOrder.filter((id) => nextIds.has(id));
        const added = [...nextIds].filter((id) => !kept.includes(id));
        return [...kept, ...added];
      });
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setOrderedIds([]);
    setSelection({});
  }, []);

  return { selection, onSelectionChange, orderedIds, clear };
}
