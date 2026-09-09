import type { VisibilityState } from "@tanstack/react-table";
import { useEffect, useState } from "react";

function readStored(storageKey: string | undefined): VisibilityState {
  if (!storageKey) return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as VisibilityState) : {};
  } catch {
    // Private browsing, disabled storage, or corrupt JSON: fall back to all columns visible.
    return {};
  }
}

/**
 * Persists column visibility per `storageKey` (typically one per table, per
 * user) so a user's hidden columns survive a reload, per
 * docs/05-shared-components.md ("kolom tersembunyi tersimpan per pengguna").
 */
export function usePersistedColumnVisibility(storageKey?: string) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    readStored(storageKey),
  );

  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(columnVisibility));
    } catch {
      // Storage full or unavailable: visibility just won't persist this session.
    }
  }, [storageKey, columnVisibility]);

  return [columnVisibility, setColumnVisibility] as const;
}
