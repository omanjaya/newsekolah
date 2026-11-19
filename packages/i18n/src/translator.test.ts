import { afterEach, describe, expect, it, vi } from "vitest";

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

  it("keeps ICU-quoted literal braces as text", () => {
    expect(translate("id", "errors.TEMPLATE_INVALID")).toBe(
      "Isi templat tidak valid. Periksa tanda {{ }} yang belum ditutup atau salah tulis.",
    );
    expect(translate("en", "errors.TEMPLATE_INVALID")).toContain("{{ }}");
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

describe("translate with values a pattern needs but did not get", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not throw when an ICU variable is missing", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => translate("id", "validation.passwordMin")).not.toThrow();
    expect(() => translate("en", "validation.maxLength", {})).not.toThrow();
  });

  it("degrades to the key and reports it in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(translate("id", "validation.passwordMin")).toBe("validation.passwordMin");
    expect(warn).toHaveBeenCalled();
  });

  it("still formats the same key once the values are given", () => {
    expect(translate("id", "validation.passwordMin", { min: 8 })).toBe(
      "Kata sandi minimal 8 karakter",
    );
  });
});
