import { describe, expect, it } from "vitest";

import { fileNameSlug, joinFileNameParts } from "./file-name-slug";

describe("fileNameSlug", () => {
  it("lowercases a name and joins its words with single hyphens", () => {
    expect(fileNameSlug("Opname Semester 1 / 2026")).toBe("opname-semester-1-2026");
    expect(fileNameSlug("  Rak  A:B*C?  ")).toBe("rak-a-b-c");
  });

  it("folds accents instead of dropping the letter", () => {
    expect(fileNameSlug("Kélas Ñusantara")).toBe("kelas-nusantara");
  });

  it("is empty when nothing usable is left", () => {
    expect(fileNameSlug("///")).toBe("");
    expect(fileNameSlug("")).toBe("");
  });

  it("caps a long name without leaving a trailing hyphen", () => {
    const slug = fileNameSlug(`${"a".repeat(59)} b`);
    expect(slug).toBe("a".repeat(59));
  });
});

describe("joinFileNameParts", () => {
  it("skips empty parts", () => {
    expect(joinFileNameParts("laporan-opname", "", "2026-11-20")).toBe("laporan-opname-2026-11-20");
  });
});
