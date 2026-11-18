import { describe, expect, it } from "vitest";

import { criterionKeyFrom } from "./criterion-key";

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
