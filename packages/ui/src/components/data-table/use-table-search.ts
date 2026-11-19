import { useCallback, useState } from "react";

import { useDebouncedCallback } from "./use-debounced-callback.js";

export interface TableSearch {
  /** Changes when the applied search was set from outside the box; the toolbar then shows it. */
  searchSyncKey: number;
  /** What the box calls as the reader types: applied after a 300ms pause. */
  onSearchChange: (value: string) => void;
  /** The box's clear button and Escape: applied at once, past the debounce. */
  clearSearch: () => void;
}

/**
 * A DataTable's search box: typing is applied after a debounce, clearing
 * at once. The box keeps its own text meanwhile. When the applied search
 * changes to a value the box never sent (a server-mode page's "Hapus semua
 * filter" clearing its own search state), `searchSyncKey` changes so the
 * box shows it; a value the box sent coming back late (through the
 * address) leaves whatever has been typed since alone.
 */
export function useTableSearch(applied: string, apply: (value: string) => void): TableSearch {
  const [sent, setSent] = useState(applied);
  const [seen, setSeen] = useState(applied);
  const [searchSyncKey, setSearchSyncKey] = useState(0);
  if (seen !== applied) {
    setSeen(applied);
    if (sent !== applied) {
      setSent(applied);
      setSearchSyncKey((key) => key + 1);
    }
  }

  const applySent = useCallback(
    (value: string) => {
      setSent(value);
      apply(value);
    },
    [apply],
  );
  const onSearchChange = useDebouncedCallback(applySent, 300);
  const clearSearch = useCallback(() => {
    onSearchChange("");
    applySent("");
  }, [applySent, onSearchChange]);

  return { searchSyncKey, onSearchChange, clearSearch };
}
