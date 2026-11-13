import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { DatePicker, type DatePickerProps } from "./date-picker.js";
import { DateRangePicker } from "./date-range-picker.js";
import { Dialog, DialogContent } from "./dialog.js";
import { MonthPicker } from "./month-picker.js";
import { Sheet, SheetContent } from "./sheet.js";

const TODAY = "2026-11-14";

/** The field and its portalled popover, each on its own (the page around them is not under test). */
async function expectOpenPickerAccessible(container: HTMLElement) {
  await expectNoAxeViolations(container);
  await expectNoAxeViolations(screen.getByRole("dialog"));
}

function LabelledDatePicker(props: Omit<DatePickerProps, "id">) {
  const [value, setValue] = useState(props.value ?? "");
  return (
    <form aria-label="Form">
      <label htmlFor="birth-date">Tanggal lahir</label>
      <p id="birth-date-hint">Sesuai akta</p>
      <DatePicker
        id="birth-date"
        aria-describedby="birth-date-hint"
        today={TODAY}
        {...props}
        value={value}
        onChange={(next) => {
          setValue(next);
          props.onChange?.(next);
        }}
      />
    </form>
  );
}

describe("DatePicker", () => {
  it("shows the long Indonesian date and is labelled by its <label>", () => {
    render(<LabelledDatePicker value="2026-11-14" name="birth_date" />);

    const field = screen.getByRole("combobox", { name: "Tanggal lahir" });
    expect(field).toHaveTextContent("14 November 2026");
    expect(field).toHaveAttribute("aria-describedby", "birth-date-hint");
    expect(field).toHaveAttribute("aria-haspopup", "dialog");
    expect(document.querySelector<HTMLInputElement>('input[name="birth_date"]')?.value).toBe(
      "2026-11-14",
    );
  });

  it("opens on the selected day, picks a date and hands focus back", async () => {
    const onChange = vi.fn();
    render(<LabelledDatePicker value="2026-11-14" onChange={onChange} />);
    const field = screen.getByRole("combobox", { name: "Tanggal lahir" });

    await userEvent.click(field);
    expect(screen.getByRole("gridcell", { name: "Sabtu, 14 November 2026" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{Enter}");

    expect(onChange).toHaveBeenCalledWith("2026-11-16");
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    expect(field).toHaveTextContent("16 November 2026");
    expect(field).toHaveFocus();
  });

  it("clears an optional value but not a required one", async () => {
    const onChange = vi.fn();
    const { unmount } = render(<LabelledDatePicker value="2026-11-14" onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Hapus tanggal" }));
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.getByRole("combobox", { name: "Tanggal lahir" })).toHaveTextContent(
      "Pilih tanggal",
    );
    expect(screen.getByRole("combobox", { name: "Tanggal lahir" })).toHaveFocus();
    unmount();

    render(<LabelledDatePicker value="2026-11-14" required />);
    expect(screen.queryByRole("button", { name: "Hapus tanggal" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Tanggal lahir" })).toHaveAttribute(
      "aria-required",
      "true",
    );
  });

  it("reflects invalid and disabled states", () => {
    render(
      <>
        <DatePicker aria-label="Tanggal mulai" aria-invalid />
        <DatePicker aria-label="Tanggal akhir" disabled value="2026-11-14" />
      </>,
    );
    expect(screen.getByRole("combobox", { name: "Tanggal mulai" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("combobox", { name: "Tanggal akhir" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Hapus tanggal" })).not.toBeInTheDocument();
  });

  it("has no accessibility violations, closed or open", async () => {
    const { container } = render(<LabelledDatePicker value="2026-11-14" />);
    await expectNoAxeViolations(container);
    await userEvent.click(screen.getByRole("combobox", { name: "Tanggal lahir" }));
    await expectOpenPickerAccessible(container);
  });

  it("keeps keyboard focus in the calendar inside a Dialog", async () => {
    const onChange = vi.fn();
    render(
      <Dialog open>
        <DialogContent title="Ubah data siswa">
          <DatePicker
            aria-label="Tanggal lahir"
            today={TODAY}
            value="2026-11-14"
            onChange={onChange}
          />
          <button type="button">Simpan</button>
        </DialogContent>
      </Dialog>,
    );
    const field = screen.getByRole("combobox", { name: "Tanggal lahir" });
    field.focus();

    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("gridcell", { name: "Sabtu, 14 November 2026" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("gridcell", { name: "Minggu, 15 November 2026" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalledWith("2026-11-15");
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    expect(field).toHaveFocus();
  });

  it("takes Escape back from the year and month views before it closes", async () => {
    render(<LabelledDatePicker value="2026-11-14" />);
    await userEvent.click(screen.getByRole("combobox", { name: "Tanggal lahir" }));
    await userEvent.click(
      screen.getByRole("button", { name: "November 2026, pilih bulan dan tahun" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "2026, pilih tahun" }));
    expect(screen.getByRole("gridcell", { name: "2026" })).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("gridcell", { name: "November 2026" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("gridcell", { name: "Sabtu, 14 November 2026" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("reaches a birth date decades back through the year view", async () => {
    const onChange = vi.fn();
    render(<LabelledDatePicker onChange={onChange} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Tanggal lahir" }));
    await userEvent.click(
      screen.getByRole("button", { name: "November 2026, pilih bulan dan tahun" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "2026, pilih tahun" }));
    expect(screen.getByRole("grid", { name: "2016–2027" })).toBeInTheDocument();

    const previousYears = screen.getByRole("button", { name: "Rentang tahun sebelumnya" });
    await userEvent.click(previousYears);
    await userEvent.click(previousYears);
    await userEvent.click(previousYears);
    await userEvent.click(screen.getByRole("gridcell", { name: "1980" }));
    await userEvent.click(screen.getByRole("gridcell", { name: "Mei 1980" }));
    expect(screen.getByRole("grid", { name: "Mei 1980" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("gridcell", { name: /^Sabtu, 17 Mei 1980/ }));

    expect(onChange).toHaveBeenLastCalledWith("1980-05-17");
  });
});

describe("DateRangePicker", () => {
  const presets = [
    { label: "Hari ini", from: TODAY, to: TODAY },
    { label: "7 hari terakhir", from: "2026-11-08", to: TODAY },
  ];

  it("commits a preset or a two-click range, never a half-picked one", async () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker aria-label="Periode" today={TODAY} presets={presets} onChange={onChange} />,
    );
    const field = screen.getByRole("combobox", { name: "Periode" });

    await userEvent.click(field);
    await userEvent.click(screen.getByRole("button", { name: "7 hari terakhir" }));
    expect(onChange).toHaveBeenLastCalledWith({ from: "2026-11-08", to: TODAY });
    expect(field).toHaveTextContent("8–14 Nov 2026");

    await userEvent.click(field);
    expect(screen.getByRole("button", { name: "7 hari terakhir" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(screen.getByRole("gridcell", { name: "Selasa, 3 November 2026" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Pilih tanggal akhir")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("gridcell", { name: "Minggu, 1 November 2026" }));

    expect(onChange).toHaveBeenLastCalledWith({ from: "2026-11-01", to: "2026-11-03" });
    expect(field).toHaveTextContent("1–3 Nov 2026");
  });

  it("has no accessibility violations when open", async () => {
    const { container } = render(
      <DateRangePicker aria-label="Periode" today={TODAY} presets={presets} />,
    );
    await userEvent.click(screen.getByRole("combobox", { name: "Periode" }));
    await expectOpenPickerAccessible(container);
  });

  it("keeps keyboard focus in the calendar inside a Sheet", async () => {
    const onChange = vi.fn();
    render(
      <Sheet open>
        <SheetContent title="Filter">
          <DateRangePicker aria-label="Periode" today={TODAY} onChange={onChange} />
          <button type="button">Terapkan</button>
        </SheetContent>
      </Sheet>,
    );
    screen.getByRole("combobox", { name: "Periode" }).focus();

    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("gridcell", { name: "Sabtu, 14 November 2026" })).toHaveFocus();
    await userEvent.keyboard("{Enter}{ArrowRight}{ArrowRight}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith({ from: TODAY, to: "2026-11-16" });
  });
});

describe("MonthPicker", () => {
  it("shows and picks a month within bounds", async () => {
    const onChange = vi.fn();
    render(
      <MonthPicker
        aria-label="Bulan laporan"
        defaultValue="2026-11"
        today={TODAY}
        max="2026-12"
        name="month"
        onChange={onChange}
      />,
    );
    const field = screen.getByRole("combobox", { name: "Bulan laporan" });
    expect(field).toHaveTextContent("November 2026");

    await userEvent.click(field);
    expect(screen.getByRole("gridcell", { name: "November 2026" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Tahun berikutnya" })).toBeDisabled();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}{Enter}");

    expect(onChange).toHaveBeenCalledWith("2026-09");
    expect(field).toHaveTextContent("September 2026");
    expect(document.querySelector<HTMLInputElement>('input[name="month"]')?.value).toBe("2026-09");
  });

  it("has no accessibility violations when open", async () => {
    const { container } = render(<MonthPicker aria-label="Bulan laporan" today={TODAY} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Bulan laporan" }));
    await expectOpenPickerAccessible(container);
  });

  it("keeps keyboard focus in the months inside a Dialog, and Escape closes from there", async () => {
    const onChange = vi.fn();
    render(
      <Dialog open>
        <DialogContent title="Laporan bulanan">
          <MonthPicker aria-label="Bulan laporan" today={TODAY} onChange={onChange} />
          <button type="button">Unduh</button>
        </DialogContent>
      </Dialog>,
    );
    const field = screen.getByRole("combobox", { name: "Bulan laporan" });
    field.focus();

    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("gridcell", { name: "November 2026" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    // The Dialog stays: Escape closed only the picker on top of it.
    expect(screen.getByRole("dialog", { name: "Laporan bulanan" })).toBeInTheDocument();

    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowLeft}{Enter}");
    expect(onChange).toHaveBeenCalledWith("2026-10");
  });

  it("reads a full date as its month for min, max and today", async () => {
    render(
      <MonthPicker
        aria-label="Bulan laporan"
        today="2026-11-14T08:00:00+08:00"
        min="2026-10-15"
        max="2026-11-30"
      />,
    );
    await userEvent.click(screen.getByRole("combobox", { name: "Bulan laporan" }));
    expect(screen.getByRole("gridcell", { name: "November 2026" })).toHaveAttribute(
      "aria-current",
      "date",
    );
    expect(screen.getByRole("gridcell", { name: "Oktober 2026" })).not.toHaveAttribute(
      "aria-disabled",
    );
    expect(screen.getByRole("gridcell", { name: "September 2026" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
