// Library scanning modes for the shared scanner (app/scan.tsx): borrowing,
// returning, and stocktake (opname) all reuse that one camera/manual-entry
// screen instead of a second scanner, switched by a `mode` route param. A
// physical book or member barcode is never wrapped in the "sion:" QR
// payload the attendance flows use (see ./payload.ts) -- the scanned or
// typed text is the barcode itself.
import { useCallback, useState } from "react";
import { router } from "expo-router";
import { ApiError } from "@newsekolah/api-client";
import { showToast } from "@/components/ui/Toast";
import { getOfflineQueue } from "@/lib/offline/queue";
import { useFlushOfflineQueue } from "@/lib/offline/sync";
import { useBorrowLoan, useReturnLoan } from "@/lib/api/hooks";
import { t, type MobileMessageKey } from "@/i18n/t";

export type LibraryScanMode = "library_borrow" | "library_return" | "library_stocktake";

// A type alias, not an interface: expo-router's useLocalSearchParams
// constrains its type argument to Record<string, string | string[]>, and
// TypeScript only recognizes a plain object type literal as satisfying
// that constraint -- a declared interface is rejected with "index
// signature is missing" even though the two are structurally identical.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type LibraryScanParams = {
  mode?: string;
  memberUserId?: string;
  loanId?: string;
  expectedBarcode?: string;
  stocktakeId?: string;
};

export function isLibraryScanMode(mode: string | undefined): mode is LibraryScanMode {
  return mode === "library_borrow" || mode === "library_return" || mode === "library_stocktake";
}

/** Borrow can fail for reasons a librarian needs to see plainly: an unknown
 * barcode, a copy already out, or the member being at their loan limit.
 * Anything else falls back to a generic error. */
const BORROW_ERROR_KEYS: Partial<Record<string, MobileMessageKey>> = {
  LIBRARY_COPY_NOT_FOUND: "library.error_barcode_unknown",
  LIBRARY_COPY_NOT_AVAILABLE: "library.error_copy_unavailable",
  LIBRARY_COPY_ON_LOAN: "library.error_copy_unavailable",
  LIBRARY_LOAN_LIMIT_REACHED: "library.error_loan_limit",
};

const RETURN_ERROR_KEYS: Partial<Record<string, MobileMessageKey>> = {
  LIBRARY_LOAN_ALREADY_RETURNED: "library.error_already_returned",
};

function errorMessage(error: unknown, table: Partial<Record<string, MobileMessageKey>>): string {
  if (error instanceof ApiError) {
    const key = table[error.code];
    if (key) return t(key);
  }
  return t("common.error");
}

function hintFor(mode: string | undefined): MobileMessageKey {
  switch (mode) {
    case "library_borrow":
      return "scan.library_borrow_hint";
    case "library_return":
      return "scan.library_return_hint";
    case "library_stocktake":
      return "scan.library_stocktake_hint";
    default:
      return "scan.hint";
  }
}

export interface LibraryScanHandler {
  hint: string;
  busy: boolean;
  act: (raw: string) => Promise<void>;
}

/**
 * One scan/typed code, dispatched by `params.mode`. Borrow and return call
 * the server directly and report the result; stocktake instead writes to
 * the offline mutation queue (lib/offline/queue.ts) immediately and never
 * blocks on the network, since a stocktake session is exactly the case
 * where the phone may have no signal at all (docs/12-roadmap.md Fase 4) --
 * see app/library/opname/[stocktakeId].tsx for how the pending count and
 * rejected scans surface afterwards.
 */
export function useLibraryScanHandler(params: LibraryScanParams): LibraryScanHandler {
  const [busy, setBusy] = useState(false);
  const borrow = useBorrowLoan();
  const returnLoan = useReturnLoan();
  const flushOfflineQueue = useFlushOfflineQueue();

  const act = useCallback(
    async (raw: string) => {
      const barcode = raw.trim();
      if (!barcode || busy || !isLibraryScanMode(params.mode)) return;
      setBusy(true);
      try {
        if (params.mode === "library_borrow") {
          if (!params.memberUserId) return;
          await borrow.mutateAsync({ barcode, member_user_id: params.memberUserId });
          showToast(t("scan.success_borrow"), "success");
          router.back();
          return;
        }
        if (params.mode === "library_return") {
          if (!params.loanId) return;
          if (params.expectedBarcode && barcode !== params.expectedBarcode) {
            showToast(t("scan.return_mismatch"), "error");
            return;
          }
          await returnLoan.mutateAsync({ id: params.loanId });
          showToast(t("scan.success_return"), "success");
          router.back();
          return;
        }
        // The only mode left once isLibraryScanMode narrowed params.mode
        // and the two branches above returned is "library_stocktake".
        if (!params.stocktakeId) return;
        await getOfflineQueue().enqueue(
          "POST",
          `/v1/library/stocktakes/${params.stocktakeId}/scans`,
          { barcode },
        );
        showToast(t("scan.stocktake_saved"), "default");
        void flushOfflineQueue();
      } catch (error) {
        const table = params.mode === "library_return" ? RETURN_ERROR_KEYS : BORROW_ERROR_KEYS;
        showToast(errorMessage(error, table), "error");
      } finally {
        setBusy(false);
      }
    },
    [params, busy, borrow, returnLoan, flushOfflineQueue],
  );

  return { hint: t(hintFor(params.mode)), busy, act };
}
