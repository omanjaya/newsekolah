import { describe, expect, it } from "vitest";

import {
  criterionKeyFrom,
  duplicateCriterionKeys,
  keyFollowsName,
  uniqueCriterionKey,
} from "./criterion-key";

describe("criterionKeyFrom", () => {
  it("turns a criterion name into a short scoring key", () => {
    expect(criterionKeyFrom("Membuka pelajaran")).toBe("membuka_pelajaran");
    expect(criterionKeyFrom("  Penilaian & refleksi! ")).toBe("penilaian_refleksi");
    expect(criterionKeyFrom("Évaluasi")).toBe("evaluasi");
  });

  it("keeps the key within its length", () => {
    expect(criterionKeyFrom("a".repeat(60))).toHaveLength(40);
  });
});

describe("uniqueCriterionKey", () => {
  it("numbers a key another criterion already uses", () => {
    expect(uniqueCriterionKey("penguasaan_kelas", new Set())).toBe("penguasaan_kelas");
    expect(uniqueCriterionKey("penguasaan_kelas", new Set(["penguasaan_kelas"]))).toBe(
      "penguasaan_kelas_2",
    );
    expect(
      uniqueCriterionKey("penguasaan_kelas", new Set(["penguasaan_kelas", "penguasaan_kelas_2"])),
    ).toBe("penguasaan_kelas_3");
  });

  it("stays within the key length", () => {
    const base = "a".repeat(40);
    const key = uniqueCriterionKey(base, new Set([base]));
    expect(key).toHaveLength(40);
    expect(key.endsWith("_2")).toBe(true);
  });
});

describe("keyFollowsName", () => {
  it("follows an empty, derived or numbered derived key", () => {
    expect(keyFollowsName("", "Penguasaan kelas")).toBe(true);
    expect(keyFollowsName("penguasaan_kelas", "Penguasaan kelas")).toBe(true);
    expect(keyFollowsName("penguasaan_kelas_2", "Penguasaan kelas")).toBe(true);
  });

  it("leaves a hand-typed key alone", () => {
    expect(keyFollowsName("pk", "Penguasaan kelas")).toBe(false);
    expect(keyFollowsName("lain_2", "Penguasaan kelas")).toBe(false);
  });
});

describe("duplicateCriterionKeys", () => {
  it("returns the keys more than one criterion uses", () => {
    expect(
      duplicateCriterionKeys([
        { key: "a" },
        { key: "b" },
        { key: " a " },
        { key: "" },
        { key: "" },
      ]),
    ).toEqual(new Set(["a"]));
  });
});
