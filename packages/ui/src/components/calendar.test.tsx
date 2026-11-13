import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act, useState } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Calendar, type DateRange } from "./calendar.js";

const TODAY = "2026-11-14";

function cell(name: string) {
  return screen.getByRole("gridcell", { name: new RegExp(`^${name}`) });
}

function ControlledCalendar({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState("2026-11-14");
  return (
    <Calendar
      value={value}
      today={TODAY}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe("Calendar", () => {
  it("lays out a Monday-first month in Indonesian with today and the selection marked", () => {
    render(<Calendar value="2026-11-10" today={TODAY} />);

    expect(screen.getByRole("grid", { name: "November 2026" })).toBeInTheDocument();
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual([
      "Sen",
      "Sel",
      "Rab",
      "Kam",
      "Jum",
      "Sab",
      "Min",
    ]);
    expect(headers[0]).toHaveAttribute("abbr", "Senin");
    expect(cell("Sabtu, 14 November 2026")).toHaveAttribute("aria-current", "date");
    expect(cell("Selasa, 10 November 2026")).toHaveAttribute("aria-selected", "true");
    expect(cell("Selasa, 10 November 2026")).toHaveAttribute("tabindex", "0");
  });

  it("follows the date grid keyboard pattern", async () => {
    const onChange = vi.fn();
    render(<ControlledCalendar onChange={onChange} />);
    cell("Sabtu, 14 November 2026").focus();

    await userEvent.keyboard("{ArrowRight}");
    expect(cell("Minggu, 15 November 2026")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(cell("Minggu, 22 November 2026")).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(cell("Senin, 16 November 2026")).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(cell("Minggu, 22 November 2026")).toHaveFocus();
    await userEvent.keyboard("{PageDown}");
    expect(screen.getByRole("grid", { name: "Desember 2026" })).toBeInTheDocument();
    expect(cell("Selasa, 22 Desember 2026")).toHaveFocus();
    await userEvent.keyboard("{Shift>}{PageUp}{/Shift}");
    expect(screen.getByRole("grid", { name: "Desember 2025" })).toBeInTheDocument();
    await userEvent.keyboard("{ArrowUp}{Enter}");

    expect(onChange).toHaveBeenLastCalledWith("2025-12-15");
    expect(cell("Senin, 15 Desember 2025")).toHaveAttribute("aria-selected", "true");
  });

  it("refuses dates outside min/max and those the caller disables", async () => {
    const onChange = vi.fn();
    render(
      <Calendar
        value=""
        today={TODAY}
        min="2026-11-05"
        max="2026-11-25"
        isDateDisabled={(date) => date === "2026-11-11"}
        onChange={onChange}
      />,
    );

    expect(cell("Rabu, 4 November 2026")).toHaveAttribute("aria-disabled", "true");
    expect(cell("Rabu, 11 November 2026")).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(cell("Rabu, 4 November 2026"));
    await userEvent.click(cell("Rabu, 11 November 2026"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Bulan sebelumnya" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bulan berikutnya" })).toBeDisabled();

    // Keyboard focus stops at the bound instead of leaving the range.
    cell("Sabtu, 14 November 2026").focus();
    await userEvent.keyboard("{PageDown}");
    expect(cell("Rabu, 25 November 2026")).toHaveFocus();
  });

  it("selects a range in either order", async () => {
    const changes: DateRange[] = [];
    function RangeCalendar() {
      const [range, setRange] = useState<DateRange>({ from: "", to: "" });
      return (
        <Calendar
          mode="range"
          value={range}
          today={TODAY}
          onChange={(next) => {
            changes.push(next);
            setRange(next);
          }}
        />
      );
    }
    render(<RangeCalendar />);

    await userEvent.click(cell("Jumat, 20 November 2026"));
    await userEvent.click(cell("Selasa, 10 November 2026"));

    expect(changes).toEqual([
      { from: "2026-11-20", to: "" },
      { from: "2026-11-10", to: "2026-11-20" },
    ]);
    expect(cell("Minggu, 15 November 2026")).toHaveAttribute("aria-selected", "true");
    expect(cell("Sabtu, 21 November 2026")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("grid")).toHaveAttribute("aria-multiselectable", "true");
  });

  it("jumps months and years through the caption", async () => {
    render(<Calendar value="2026-11-14" today={TODAY} />);

    await userEvent.click(
      screen.getByRole("button", { name: "November 2026, pilih bulan dan tahun" }),
    );
    expect(screen.getByRole("gridcell", { name: "November 2026" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Tahun berikutnya" }));
    await userEvent.click(screen.getByRole("gridcell", { name: "Maret 2027" }));

    expect(screen.getByRole("grid", { name: "Maret 2027" })).toBeInTheDocument();
  });

  it("reads timestamp bounds as dates and ignores a month in another shape", () => {
    render(<Calendar today={TODAY} min="2026-11-14T00:00:00Z" month="2026-13" />);

    expect(screen.getByRole("grid", { name: "November 2026" })).toBeInTheDocument();
    expect(cell("Jumat, 13 November 2026")).toHaveAttribute("aria-disabled", "true");
    expect(cell("Sabtu, 14 November 2026")).toHaveAttribute("tabindex", "0");
  });

  it("server-renders no month without a value or today, so hydration cannot disagree", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const container = document.createElement("div");
    document.body.append(container);
    try {
      // The server's clock says 31 October; by hydration the device's says 1 November.
      vi.setSystemTime(new Date(2026, 9, 31, 23, 30));
      container.innerHTML = renderToString(<Calendar />);
      expect(container.firstElementChild).toHaveClass("invisible");

      vi.setSystemTime(new Date(2026, 10, 1, 0, 30));
      const onRecoverableError = vi.fn();
      let root: Root | undefined;
      await act(async () => {
        root = hydrateRoot(container, <Calendar />, { onRecoverableError });
        await Promise.resolve();
      });

      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(within(container).getByRole("grid", { name: "November 2026" })).toBeInTheDocument();
      expect(container.firstElementChild).not.toHaveClass("invisible");
      act(() => {
        root?.unmount();
      });
    } finally {
      container.remove();
      vi.useRealTimers();
    }
  });

  it("renders caller markers with an accessible description", () => {
    render(
      <Calendar
        layout="fluid"
        today={TODAY}
        renderDay={(day) =>
          day.date === "2026-11-12" ? <span data-testid="marker">Ujian</span> : null
        }
        getDayDescription={(date) => (date === "2026-11-12" ? "Ujian tengah semester" : undefined)}
      />,
    );

    expect(screen.getByTestId("marker")).toBeInTheDocument();
    expect(
      screen.getByRole("gridcell", { name: "Kamis, 12 November 2026, Ujian tengah semester" }),
    ).toBeInTheDocument();
  });

  it("names months and weekdays in the given locale", () => {
    render(<Calendar locale="en-US" today={TODAY} />);
    expect(screen.getByRole("grid", { name: "November 2026" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")[0]).toHaveTextContent("Mon");
  });

  it("has no accessibility violations in either view", async () => {
    const { container } = render(<Calendar value="2026-11-14" today={TODAY} />);
    await expectNoAxeViolations(container);
    await userEvent.click(screen.getByRole("button", { name: /pilih bulan dan tahun/ }));
    await expectNoAxeViolations(container);
  });
});
