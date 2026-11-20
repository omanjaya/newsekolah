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
  /**
   * The borrower of the loan a return or renewal acted on, when the server
   * said whose it was. An idle desk can return books from many readers, so
   * this decides which rows belong on the receipt of the member then served.
   */
  memberUserId?: string;
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

/**
 * `confirmableItems` oldest scan first, the order Confirm submits. The
 * basket is stored newest first (for display and undo), but the server
 * spends the member's remaining quota in request order, so the books
 * scanned first must be sent first.
 */
export function confirmableItemsInScanOrder(items: DeskBasketItem[]): DeskBasketItem[] {
  return confirmableItems(items).reverse();
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

export type BorrowBlockReason = "onLoan" | "notAvailable" | "notLoanable";

/**
 * Whether a copy found for the Pinjam mode can be added as a pending
 * (loanable) item, and if not, a machine-readable reason key to translate.
 * A reserved copy is not blocked here: it is lendable to the member whose
 * ready reservation holds it, which only the server knows, so Confirm lets
 * the server decide and shows its reason on the row if it refuses.
 * Return/Renew modes have no equivalent client-side check: whether a copy
 * is actually on loan to this member is only known once the server is
 * called, so every scan for those two modes goes straight to it.
 */
export function classifyBorrowCopy(copy: {
  status: string;
  access: string;
}): { blocked: false } | { blocked: true; reasonKey: BorrowBlockReason } {
  if (copy.access === "reference" || copy.access === "read_in_place") {
    return { blocked: true, reasonKey: "notLoanable" };
  }
  if (copy.status === "available" || copy.status === "reserved") {
    return { blocked: false };
  }
  if (copy.status === "on_loan") {
    return { blocked: true, reasonKey: "onLoan" };
  }
  return { blocked: true, reasonKey: "notAvailable" };
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
