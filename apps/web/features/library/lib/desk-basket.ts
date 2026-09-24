/**
 * Pure state for the circulation desk's continuous scan flow: one member,
 * one basket of scanned copies per mode (Pinjam/Kembali/Perpanjang), built
 * up by scanning and cleared by one Confirm. Kept free of React and the
 * API client so the scan-add-undo-confirm sequence is unit testable
 * without a DOM or a mocked query client.
 */
export type DeskMode = "borrow" | "return" | "renew";

export const DESK_MODES: DeskMode[] = ["borrow", "return", "renew"];

export type DeskBasketItemState =
  /** Scanned, valid, waiting for Confirm. */
  | "pending"
  /** Scanned but this mode cannot act on it (e.g. borrowing a copy that is already on loan); excluded from Confirm. */
  | "blocked"
  /** Confirm processed it and the server accepted it. */
  | "done"
  /** Confirm processed it and the server rejected it. */
  | "failed";

export interface DeskBasketItem {
  barcode: string;
  title: string;
  state: DeskBasketItemState;
  /** Shown under the title once known: a block reason before Confirm, or a result after it. */
  detail?: string;
}

const MAX_BASKET_SIZE = 50;

/**
 * Adds a scanned copy to the basket. A barcode already present is left in
 * place rather than duplicated -- the same copy scanned twice in a row
 * (a nervous re-scan, or the scanner double-firing) should not appear as
 * two rows, and a full basket silently ignores further scans instead of
 * growing without bound (mirrors the batch-borrow endpoint's own 50-item cap).
 */
export function addBasketItem(items: DeskBasketItem[], item: DeskBasketItem): DeskBasketItem[] {
  if (items.some((existing) => existing.barcode === item.barcode)) return items;
  if (items.length >= MAX_BASKET_SIZE) return items;
  return [item, ...items];
}

/** Removes the most recently scanned item still pending -- "undo last scan". A confirmed result is never undone this way. */
export function undoLastBasketItem(items: DeskBasketItem[]): DeskBasketItem[] {
  const index = items.findIndex((item) => item.state === "pending" || item.state === "blocked");
  if (index === -1) return items;
  return [...items.slice(0, index), ...items.slice(index + 1)];
}

export function removeBasketItem(items: DeskBasketItem[], barcode: string): DeskBasketItem[] {
  return items.filter((item) => item.barcode !== barcode);
}

/** Whether `undoLastBasketItem` has anything to do -- an unsettled (pending or blocked) item. */
export function hasUndoableItem(items: DeskBasketItem[]): boolean {
  return items.some((item) => item.state === "pending" || item.state === "blocked");
}

/** Items Confirm will actually submit: pending, not blocked and not already processed. */
export function confirmableItems(items: DeskBasketItem[]): DeskBasketItem[] {
  return items.filter((item) => item.state === "pending");
}

/** True once every basket item has a final result (or the basket is empty), so the session can offer a receipt. */
export function isBasketSettled(items: DeskBasketItem[]): boolean {
  return (
    items.length > 0 && items.every((item) => item.state === "done" || item.state === "failed")
  );
}

export function updateBasketItem(
  items: DeskBasketItem[],
  barcode: string,
  patch: Partial<DeskBasketItem>,
): DeskBasketItem[] {
  return items.map((item) => (item.barcode === barcode ? { ...item, ...patch } : item));
}

/**
 * Whether a copy found for the Pinjam mode can be added as a pending
 * (loanable) item, and if not, a machine-readable reason key to translate.
 * Return/Renew modes have no equivalent client-side check: whether a copy
 * is actually on loan to this member is only known once Confirm calls the
 * server, so every scan for those two modes is added as "pending".
 */
export function classifyBorrowCopy(copy: {
  status: string;
  access: string;
}): { blocked: false } | { blocked: true; reasonKey: "notAvailable" | "notLoanable" } {
  if (copy.access === "reference" || copy.access === "read_in_place") {
    return { blocked: true, reasonKey: "notLoanable" };
  }
  if (copy.status !== "available") {
    return { blocked: true, reasonKey: "notAvailable" };
  }
  return { blocked: false };
}

/**
 * `LibraryBatchBorrowResult.rejected[].reason` is the server's raw Go
 * `error.Error()` text (apps/api/internal/modules/library/service/loans.go's
 * `BatchBorrow`), not an `ApiError.code` -- a single rejected barcode does
 * not fail the whole batch request, so it never goes through the usual
 * `mapError` -> code -> `errors.*` i18n translation that a single borrow,
 * return, or renewal call gets. This maps that fixed, finite set of
 * domain error strings (apps/api/internal/modules/library/domain/library.go)
 * back to the same `errors.*` codes the rest of the app already
 * translates, so a rejected barcode reads in the user's language instead
 * of raw English. An unrecognized string (a future error this list has
 * not caught up with yet) falls back to showing the raw reason rather
 * than hiding it.
 */
const BORROW_REJECT_REASON_CODES: Record<string, string> = {
  "copy not found": "LIBRARY_COPY_NOT_FOUND",
  "copy is not available": "LIBRARY_COPY_NOT_AVAILABLE",
  "copy is already on loan": "LIBRARY_COPY_ON_LOAN",
  "library member not found": "LIBRARY_MEMBER_NOT_FOUND",
  "library member is not active": "LIBRARY_MEMBER_NOT_ACTIVE",
  "library member is suspended": "LIBRARY_MEMBER_SUSPENDED",
  "library membership has expired": "LIBRARY_MEMBER_EXPIRED",
  "member has an unpaid fine": "LIBRARY_UNPAID_FINE",
  "member has reached the active loan limit": "LIBRARY_LOAN_LIMIT_REACHED",
  "lending is closed for this date": "LIBRARY_LOANS_CLOSED",
};

/** The `errors.*` i18n code for a rejected barcode's raw reason, or the reason itself when unrecognized. */
export function borrowRejectReasonCode(reason: string): { code: string } | { raw: string } {
  const code = BORROW_REJECT_REASON_CODES[reason];
  return code ? { code } : { raw: reason };
}

/** Alt+1/2/3 switches mode, Alt+Z undoes the last scan -- combinations a hardware scanner never emits (it only ever sends plain characters plus Enter). */
export function matchDeskShortcut(event: {
  altKey: boolean;
  key: string;
}): DeskMode | "undo" | null {
  if (!event.altKey) return null;
  if (event.key === "1") return "borrow";
  if (event.key === "2") return "return";
  if (event.key === "3") return "renew";
  if (event.key.toLowerCase() === "z") return "undo";
  return null;
}
