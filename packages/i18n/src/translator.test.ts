import { describe, expect, it } from "vitest";

import { createTranslator, translate } from "./translator.js";

describe("translate", () => {
  it("resolves a plain key in Indonesian", () => {
    expect(translate("id", "common.actions.save")).toBe("Simpan");
  });

  it("resolves the same key in English", () => {
    expect(translate("en", "common.actions.save")).toBe("Save");
  });

  it("interpolates ICU number placeholders", () => {
    expect(translate("id", "validation.minLength", { min: 8 })).toBe("Minimal 8 karakter");
  });

  it("resolves ICU plural rules", () => {
    expect(translate("id", "common.table.rowsSelected", { count: 1 })).toBe("1 baris dipilih");
    expect(translate("id", "common.table.rowsSelected", { count: 5 })).toBe("5 baris dipilih");
  });

  it("falls back to the key when no catalog has it", () => {
    // @ts-expect-error intentionally invalid key to test the fallback path
    expect(translate("id", "does.not.exist")).toBe("does.not.exist");
  });

  it("createTranslator binds the locale", () => {
    const t = createTranslator("en");
    expect(t("common.actions.cancel")).toBe("Cancel");
  });
});
