import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { Edits } from "../components/gradebook-types";

import { clearGradebookDraft, loadGradebookDraft, saveGradebookDraft } from "./gradebook-draft";

export interface GradebookDraftState {
  /** A stored draft offered for restore, with when it was last written; null when there is none to offer. */
  draftOffer: { savedAt: string } | null;
  restoreDraft: () => void;
  dismissDraft: () => void;
}

/** Whether stored edits hold at least one cell: a column with no cells left is no draft. */
function hasDraftCells(edits: Edits): boolean {
  return Object.values(edits).some((column) => Object.keys(column).length > 0);
}

/**
 * Keeps a gradebook sheet's local edits mirrored to its stored draft
 * (`./gradebook-draft.ts`) and offers a draft left from before a reload or
 * a dropped connection. `pendingChanges` is the number of edited cells in
 * `edits`.
 */
export function useGradebookDraft(
  draftOwner: string | null,
  sheetKey: string,
  edits: Edits,
  pendingChanges: number,
  setEdits: Dispatch<SetStateAction<Edits>>,
): GradebookDraftState {
  const [draftOffer, setDraftOffer] = useState<{ savedAt: string } | null>(null);

  // Offer to restore an in-progress draft the browser still has, once per
  // sheet and owner (rechecked when the owner becomes known, withdrawn
  // when there is none).
  useEffect(() => {
    const draft = loadGradebookDraft(draftOwner, sheetKey);
    const offer = draft !== null && hasDraftCells(draft.edits) ? { savedAt: draft.savedAt } : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors attendance/components/session-editor.tsx's own draft-offer effect.
    setDraftOffer(offer);
  }, [draftOwner, sheetKey]);

  // Mirrors every edit to localStorage (try/catch inside the helper) so a
  // dropped classroom connection or an accidental reload does not throw
  // away work still only in the local buffer. When the pending edits go
  // from some to none without a save (the teacher typed a value and then
  // cleared it, or typed the saved score back) the stored draft is removed
  // too, so it is not offered again after a reload. On first mount there
  // are no edits yet while a stored draft is being offered, so nothing is
  // cleared then; nor when the sheet or owner itself changed.
  const previousRef = useRef({ owner: draftOwner, sheetKey, count: 0 });
  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = { owner: draftOwner, sheetKey, count: pendingChanges };
    if (pendingChanges > 0) {
      saveGradebookDraft(draftOwner, sheetKey, edits);
      return;
    }
    const sameSheet = previous.owner === draftOwner && previous.sheetKey === sheetKey;
    if (previous.count > 0 && sameSheet) clearGradebookDraft(draftOwner, sheetKey);
  }, [draftOwner, sheetKey, edits, pendingChanges]);

  function restoreDraft() {
    const draft = loadGradebookDraft(draftOwner, sheetKey);
    if (!draft) return;
    setEdits((prev) => {
      const next: Edits = { ...prev };
      for (const [componentId, byStudent] of Object.entries(draft.edits)) {
        if (Object.keys(byStudent).length === 0) continue;
        next[componentId] = { ...next[componentId], ...byStudent };
      }
      return next;
    });
    setDraftOffer(null);
  }

  function dismissDraft() {
    clearGradebookDraft(draftOwner, sheetKey);
    setDraftOffer(null);
  }

  return { draftOffer, restoreDraft, dismissDraft };
}
