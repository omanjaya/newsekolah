import { describe, expect, it } from "vitest";

import { classificationGroup, classificationGroups } from "./opac-classifications";

describe("classificationGroup", () => {
  it("takes the broad group before the dash", () => {
    expect(classificationGroup("Fiksi - Novel Indonesia")).toBe("Fiksi");
    expect(classificationGroup("Non-Fiksi - Sejarah Peradaban")).toBe("Non-Fiksi");
  });

  it("keeps a hyphenated word and an unsplit value whole", () => {
    expect(classificationGroup("Non-Fiksi")).toBe("Non-Fiksi");
    expect(classificationGroup("  Referensi ")).toBe("Referensi");
  });

  it("returns nothing for an empty classification", () => {
    expect(classificationGroup("")).toBe("");
  });
});

describe("classificationGroups", () => {
  it("orders groups by size, then by name, and skips empty ones", () => {
    const titles = [
      { classification: "Non-Fiksi - Majalah Berita" },
      { classification: "Fiksi - Novel Indonesia" },
      { classification: "" },
      { classification: "Non-Fiksi - Sejarah Peradaban" },
      { classification: "Referensi - Kamus" },
      { classification: "Fiksi - Cerpen" },
      { classification: "Fiksi - Puisi" },
    ];
    expect(classificationGroups(titles)).toEqual(["Fiksi", "Non-Fiksi", "Referensi"]);
  });

  it("caps the number of groups", () => {
    const titles = ["A", "B", "C", "D"].map((group) => ({ classification: `${group} - x` }));
    expect(classificationGroups(titles, 2)).toEqual(["A", "B"]);
  });
});
