import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { compiledFormsDataCss } from "../test/forms-data-css.js";

import { Combobox } from "./combobox.js";
import { DatePicker } from "./date-picker.js";
import { FIELD_TEXT, FIELD_TOUCH_TEXT } from "./field-styles.js";
import { Input } from "./input.js";
import { NumberInput } from "./number-input.js";
import { SearchInput } from "./search-input.js";
import { Select } from "./select.js";
import { Textarea } from "./textarea.js";
import { TimePicker } from "./time-picker.js";

describe("field text on touch", () => {
  // iOS Safari zooms the page into any focused field whose text is under
  // 16px; the field's text is 16px wherever its box is the 44px touch size.
  it("raises the body role to 16/24 where the field is a touch target", async () => {
    const css = await compiledFormsDataCss([FIELD_TOUCH_TEXT]);
    expect(css).toMatch(/@media \(width < 48rem\), \(pointer: coarse\), \(pointer: none\)/);
    expect(css).toContain("--type-body-size: var(--text-16)");
    expect(css).toContain("--type-body-line-height: calc(var(--text-16) * 1.5)");
  });

  it("is part of both field sizes", () => {
    expect(FIELD_TEXT.md.split(" ")).toContain(FIELD_TOUCH_TEXT);
    expect(FIELD_TEXT.sm.split(" ")).toContain(FIELD_TOUCH_TEXT);
  });

  it("reaches every text control of the field family", async () => {
    render(
      <>
        <Input aria-label="Nama" />
        <Input aria-label="Nominal" leading="Rp" />
        <Input aria-label="Filter" size="sm" />
        <Textarea aria-label="Catatan" />
        <SearchInput aria-label="Cari" />
        <NumberInput aria-label="Nilai" value={1} onChange={vi.fn()} />
        <TimePicker aria-label="Jam" />
        <DatePicker aria-label="Tanggal" value="" onChange={vi.fn()} />
        <Select aria-label="Kelas" options={[{ value: "a", label: "A" }]} />
        <Combobox
          aria-label="Wali kelas"
          options={[{ value: "rina", label: "Rina" }]}
          value=""
          onValueChange={vi.fn()}
          search=""
          onSearchChange={vi.fn()}
        />
      </>,
    );
    const carries = (element: Element) =>
      element.classList.contains(FIELD_TOUCH_TEXT) ||
      element.closest(`.${FIELD_TOUCH_TEXT}`) !== null;

    for (const name of ["Nama", "Nominal", "Filter", "Catatan"]) {
      expect(carries(screen.getByRole("textbox", { name })), name).toBe(true);
    }
    expect(carries(screen.getByRole("searchbox", { name: "Cari" }))).toBe(true);
    expect(carries(screen.getByRole("combobox", { name: "Jam" }))).toBe(true);
    expect(carries(screen.getByRole("spinbutton", { name: "Nilai" }))).toBe(true);
    expect(carries(screen.getByRole("combobox", { name: "Tanggal" }))).toBe(true);
    expect(carries(screen.getByRole("combobox", { name: "Kelas" }))).toBe(true);

    const combobox = screen.getByRole("button", { name: "Wali kelas" });
    expect(carries(combobox)).toBe(true);
    await userEvent.click(combobox);
    expect(carries(await screen.findByPlaceholderText("Cari"))).toBe(true);
  });

  it("lets a caller's own text role replace the field's", () => {
    render(<Input aria-label="Kode" className="text-body-sm" />);
    const input = screen.getByRole("textbox", { name: "Kode" });
    expect(input).toHaveClass("text-body-sm");
    expect(input).not.toHaveClass("text-body");
  });
});
