import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { DatePicker, type DatePickerProps } from "./date-picker.js";
import { DateRangePicker } from "./date-range-picker.js";
import { MonthPicker } from "./month-picker.js";

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
});
