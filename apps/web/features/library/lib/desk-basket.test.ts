import { describe, expect, it } from "vitest";

import {
  type DeskBasketItem,
  addBasketItem,
  borrowRejectReasonCode,
  classifyBorrowCopy,
  confirmableItems,
  hasUndoableItem,
  isBasketSettled,
  matchDeskShortcut,
  removeBasketItem,
  undoLastBasketItem,
  updateBasketItem,
} from "./desk-basket";

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
  it("blocks a copy that is not available", () => {
    expect(classifyBorrowCopy({ status: "on_loan", access: "loanable" })).toEqual({
      blocked: true,
      reasonKey: "notAvailable",
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

describe("borrowRejectReasonCode", () => {
  it("maps a known raw Go error string to its errors.* code", () => {
    expect(borrowRejectReasonCode("copy is not available")).toEqual({
      code: "LIBRARY_COPY_NOT_AVAILABLE",
    });
    expect(borrowRejectReasonCode("library member is suspended")).toEqual({
      code: "LIBRARY_MEMBER_SUSPENDED",
    });
  });

  it("falls back to the raw reason for an unrecognized string", () => {
    expect(borrowRejectReasonCode("some future error")).toEqual({ raw: "some future error" });
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
