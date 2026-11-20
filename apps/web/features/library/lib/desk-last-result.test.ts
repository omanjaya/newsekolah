import { describe, expect, it } from "vitest";

import { deskLastResult } from "./desk-last-result";

const returned = { barcode: "2026/00012", title: "Matematika", state: "done" as const };

describe("deskLastResult", () => {
  it("is idle before anything was scanned", () => {
    expect(
      deskLastResult({ scanError: "", memberName: null, memberNeedsAttention: false, items: [] }),
    ).toBeNull();
  });

  it("shows a book returned with no member being served", () => {
    expect(
      deskLastResult({
        scanError: "",
        memberName: null,
        memberNeedsAttention: false,
        items: [returned],
      }),
    ).toEqual({ kind: "item", item: returned });
  });

  it("shows the member just picked until a book is scanned", () => {
    expect(
      deskLastResult({ scanError: "", memberName: "Siswa", memberNeedsAttention: true, items: [] }),
    ).toEqual({ kind: "member", name: "Siswa", attention: true });
  });

  it("lets a scan error win", () => {
    expect(
      deskLastResult({
        scanError: "boom",
        memberName: "Siswa",
        memberNeedsAttention: false,
        items: [returned],
      }),
    ).toEqual({ kind: "error", message: "boom" });
  });
});
