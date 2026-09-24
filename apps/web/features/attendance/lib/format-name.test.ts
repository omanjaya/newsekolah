import { describe, expect, it } from "vitest";

import { formatDisplayName } from "./format-name";

describe("formatDisplayName", () => {
  it("title-cases an ALL CAPS name", () => {
    expect(formatDisplayName("AHMAD FIKRI ALHAD")).toBe("Ahmad Fikri Alhad");
  });

  it("keeps a Balinese single-letter given name a bare capital", () => {
    expect(formatDisplayName("I GEDE ARTHA WIJAYA")).toBe("I Gede Artha Wijaya");
    expect(formatDisplayName("NI KADEK NARESWARI WIJAYA PUTRI")).toBe(
      "Ni Kadek Nareswari Wijaya Putri",
    );
  });

  it("capitalises every letter segment of a dotted initial", () => {
    expect(formatDisplayName("R.A. ALYA PUTRI PRABANCANA")).toBe("R.A. Alya Putri Prabancana");
  });

  it("capitalises a dotted academic title", () => {
    expect(formatDisplayName("NI MADE EVA JUNIHENSARI, S.PD.")).toBe(
      "Ni Made Eva Junihensari, S.Pd.",
    );
  });

  it("lowercases a name particle unless it starts the name", () => {
    expect(formatDisplayName("MUHAMMAD BIN ABDULLAH")).toBe("Muhammad bin Abdullah");
  });

  it("leaves an already mixed-case name untouched", () => {
    expect(formatDisplayName("Ahmad Fikri Alhad")).toBe("Ahmad Fikri Alhad");
    expect(formatDisplayName("McKenzie Putri")).toBe("McKenzie Putri");
  });

  it("handles an empty string", () => {
    expect(formatDisplayName("")).toBe("");
  });
});
