import { describe, expect, it } from "vitest";

import {
  type DeskBasketItem,
  addBasketItem,
  classifyBorrowCopy,
  confirmableItems,
  confirmableItemsInScanOrder,
  hasUndoableItem,
  isBasketSettled,
  matchDeskShortcut,
  recordBasketResult,
  removeBasketItem,
  undoLastBasketItem,
  updateBasketItem,
} from "./desk-basket";
import { deskLastResult } from "./desk-last-result";

function item(barcode: string, overrides: Partial<DeskBasketItem> = {}): DeskBasketItem {
  return { barcode, title: `Title ${barcode}`, state: "pending", ...overrides };
}

describe("addBasketItem", () => {
  it("adds a new item to the front", () => {
    const result = addBasketItem([item("A")], item("B"));
    expect(result.map((i) => i.barcode)).toEqual(["B", "A"]);
  });

  it("ignores a barcode already in the basket", () => {
    const result = addBasketItem([item("A")], item("A", { title: "Different title" }));
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("Title A");
  });

  it("stops growing once the cap is reached", () => {
    const full = Array.from({ length: 50 }, (_, i) => item(`B${i}`));
    const result = addBasketItem(full, item("new"));
    expect(result).toHaveLength(50);
    expect(result.some((i) => i.barcode === "new")).toBe(false);
  });
});

// A renewal refused at 09:00 and saved on a re-scan at 07:45 used to keep
// showing the refusal: the saved result was dropped as a duplicate.
describe("recordBasketResult", () => {
  it("replaces a failed row with the saved result and moves it to the front", () => {
    const before = [
      item("B", { state: "done" }),
      item("A", {
        state: "failed",
        detail: "Peminjaman yang sudah terlambat tidak bisa diperpanjang",
      }),
    ];
    const result = recordBasketResult(
      before,
      item("A", { state: "done", detail: "Diperpanjang sampai 1 Januari 2027" }),
    );
    expect(result.map((i) => [i.barcode, i.state, i.detail])).toEqual([
      ["A", "done", "Diperpanjang sampai 1 Januari 2027"],
      ["B", "done", undefined],
    ]);
    expect(
      deskLastResult({
        scanError: "",
        memberName: null,
        memberNeedsAttention: false,
        items: result,
      }),
    ).toEqual({
      kind: "item",
      item: result[0],
    });
  });

  it("keeps the newest detail when a copy is renewed twice", () => {
    const first = recordBasketResult([], item("A", { state: "done", detail: "until 24 Dec" }));
    const second = recordBasketResult(first, item("A", { state: "done", detail: "until 4 Jan" }));
    expect(second).toHaveLength(1);
    expect(second[0]?.detail).toBe("until 4 Jan");
  });

  it("never drops a saved result on a full receipt, letting go of the oldest row", () => {
    const full = Array.from({ length: 50 }, (_, i) => item(`B${i}`, { state: "done" }));
    const result = recordBasketResult(full, item("new", { state: "done" }));
    expect(result).toHaveLength(50);
    expect(result[0]?.barcode).toBe("new");
    expect(result.some((i) => i.barcode === "B49")).toBe(false);
  });
});

describe("undoLastBasketItem", () => {
  it("removes the most recently scanned pending item (front of the list)", () => {
    const result = undoLastBasketItem([item("B"), item("A")]);
    expect(result.map((i) => i.barcode)).toEqual(["A"]);
  });

  it("skips already-settled items and removes the next pending one", () => {
    const result = undoLastBasketItem([item("B", { state: "done" }), item("A")]);
    expect(result.map((i) => i.barcode)).toEqual(["B"]);
  });

  it("does nothing on an empty or fully settled basket", () => {
    expect(undoLastBasketItem([])).toEqual([]);
    const settled = [item("A", { state: "done" })];
    expect(undoLastBasketItem(settled)).toBe(settled);
  });

  it("also undoes a blocked item", () => {
    const result = undoLastBasketItem([item("A", { state: "blocked" })]);
    expect(result).toEqual([]);
  });
});

describe("removeBasketItem / updateBasketItem", () => {
  it("removeBasketItem filters by barcode", () => {
    expect(removeBasketItem([item("A"), item("B")], "A").map((i) => i.barcode)).toEqual(["B"]);
  });

  it("updateBasketItem patches only the matching item", () => {
    const result = updateBasketItem([item("A"), item("B")], "A", {
      state: "done",
      detail: "ok",
    });
    expect(result[0]).toMatchObject({ barcode: "A", state: "done", detail: "ok" });
    expect(result[1]).toMatchObject({ barcode: "B", state: "pending" });
  });
});

describe("confirmableItemsInScanOrder", () => {
  it("submits the books oldest scan first, so the first scanned gets the remaining quota", () => {
    let basket: DeskBasketItem[] = [];
    for (const barcode of ["A", "B", "C"]) basket = addBasketItem(basket, item(barcode));
    basket = updateBasketItem(basket, "B", { state: "blocked" });
    expect(basket.map((i) => i.barcode)).toEqual(["C", "B", "A"]);
    expect(confirmableItemsInScanOrder(basket).map((i) => i.barcode)).toEqual(["A", "C"]);
    expect(basket.map((i) => i.barcode)).toEqual(["C", "B", "A"]);
  });
});

describe("confirmableItems / isBasketSettled", () => {
  it("confirmableItems keeps only pending items", () => {
    const items = [
      item("A", { state: "pending" }),
      item("B", { state: "blocked" }),
      item("C", { state: "done" }),
    ];
    expect(confirmableItems(items).map((i) => i.barcode)).toEqual(["A"]);
  });

  it("isBasketSettled is false while any item is still pending", () => {
    expect(isBasketSettled([item("A", { state: "done" }), item("B")])).toBe(false);
  });

  it("isBasketSettled is true once every item is done or failed", () => {
    expect(isBasketSettled([item("A", { state: "done" }), item("B", { state: "failed" })])).toBe(
      true,
    );
  });

  it("isBasketSettled is false for an empty basket (nothing to receipt)", () => {
    expect(isBasketSettled([])).toBe(false);
  });
});

describe("classifyBorrowCopy", () => {
  it("blocks a copy on loan as on loan", () => {
    expect(classifyBorrowCopy({ status: "on_loan", access: "loanable" })).toEqual({
      blocked: true,
      reasonKey: "onLoan",
    });
  });

  it("blocks a damaged, lost or in-repair copy as not available, not as on loan", () => {
    for (const status of ["damaged", "lost", "in_repair", "processing", "unknown"]) {
      expect(classifyBorrowCopy({ status, access: "loanable" })).toEqual({
        blocked: true,
        reasonKey: "notAvailable",
      });
    }
  });

  it("leaves a reserved copy to the server, which lends it to the member it is held for", () => {
    expect(classifyBorrowCopy({ status: "reserved", access: "loanable" })).toEqual({
      blocked: false,
    });
  });

  it("blocks a reference-only or read-in-place copy even if available", () => {
    expect(classifyBorrowCopy({ status: "available", access: "reference" })).toEqual({
      blocked: true,
      reasonKey: "notLoanable",
    });
    expect(classifyBorrowCopy({ status: "available", access: "read_in_place" })).toEqual({
      blocked: true,
      reasonKey: "notLoanable",
    });
  });

  it("allows an available, loanable copy", () => {
    expect(classifyBorrowCopy({ status: "available", access: "loanable" })).toEqual({
      blocked: false,
    });
  });
});

describe("hasUndoableItem", () => {
  it("is true when a pending or blocked item exists", () => {
    expect(hasUndoableItem([item("A", { state: "pending" })])).toBe(true);
    expect(hasUndoableItem([item("A", { state: "blocked" })])).toBe(true);
  });

  it("is false once everything is settled or the basket is empty", () => {
    expect(hasUndoableItem([item("A", { state: "done" })])).toBe(false);
    expect(hasUndoableItem([])).toBe(false);
  });
});

describe("matchDeskShortcut", () => {
  it("maps Alt+1/2/3 to modes", () => {
    expect(matchDeskShortcut({ altKey: true, key: "1" })).toBe("borrow");
    expect(matchDeskShortcut({ altKey: true, key: "2" })).toBe("return");
    expect(matchDeskShortcut({ altKey: true, key: "3" })).toBe("renew");
  });

  it("maps Alt+Z (either case) to undo", () => {
    expect(matchDeskShortcut({ altKey: true, key: "z" })).toBe("undo");
    expect(matchDeskShortcut({ altKey: true, key: "Z" })).toBe("undo");
  });

  it("ignores the same keys without Alt, so scanner input is never mistaken for a shortcut", () => {
    expect(matchDeskShortcut({ altKey: false, key: "1" })).toBeNull();
    expect(matchDeskShortcut({ altKey: false, key: "z" })).toBeNull();
  });

  it("ignores unrelated keys", () => {
    expect(matchDeskShortcut({ altKey: true, key: "q" })).toBeNull();
  });
});
