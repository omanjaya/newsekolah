import { describe, expect, it, vi } from "vitest";

import { studentPaletteItems } from "./palette-items";

describe("studentPaletteItems", () => {
  const hits = [
    { id: "s1", name: "BUDI SANTOSO", username: "2301001", profile_kind: "student" as const },
    { id: "s2", name: "Ani Lestari", username: "2301002", profile_kind: "student" as const },
  ];

  it("renders the name in display case with the username, and searches by both", () => {
    const items = studentPaletteItems(hits, { icon: null, onSelect: vi.fn() });

    expect(items.map((item) => item.label)).toEqual([
      "Budi Santoso (2301001)",
      "Ani Lestari (2301002)",
    ]);
    expect(items[0]?.keywords).toEqual(["BUDI SANTOSO", "2301001"]);
    expect(items[0]?.id).toBe("student-s1");
  });

  it("selects the student by id", () => {
    const onSelect = vi.fn();
    const items = studentPaletteItems(hits, { icon: null, onSelect });

    items[1]?.onSelect();

    expect(onSelect).toHaveBeenCalledWith("s2");
  });

  it("returns no rows for no hits", () => {
    expect(studentPaletteItems([], { icon: null, onSelect: vi.fn() })).toEqual([]);
  });
});
