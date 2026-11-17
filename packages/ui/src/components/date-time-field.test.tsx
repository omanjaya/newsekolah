import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { DateTimeField, type DateTimeFieldProps } from "./date-time-field.js";

const TODAY = "2026-11-14";

function Controlled(props: Partial<DateTimeFieldProps> & { initial?: string }) {
  const [value, setValue] = useState(props.initial ?? "");
  return (
    <DateTimeField
      dateLabel="Tanggal sesi"
      timeLabel="Jam sesi"
      today={TODAY}
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
    />
  );
}

describe("DateTimeField", () => {
  it("shows a datetime-local value as a labelled date and time", async () => {
    const { container } = render(<Controlled initial="2026-11-14T09:30" required />);
    expect(screen.getByRole("combobox", { name: /Tanggal sesi/ })).toHaveTextContent(
      "14 November 2026",
    );
    expect(screen.getByRole("combobox", { name: /Jam sesi/ })).toHaveValue("09.30");
    await expectNoAxeViolations(container);
  });

  it("fills the morning time when a date is picked first", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Tanggal sesi" }));
    // The calendar opens on today; Enter picks it.
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("2026-11-14T07:00");
  });

  it("keeps the date when the time changes", async () => {
    const onChange = vi.fn();
    render(<Controlled initial="2026-11-10T07:00" onChange={onChange} />);
    const time = screen.getByRole("combobox", { name: "Jam sesi" });
    await userEvent.clear(time);
    await userEvent.type(time, "1015");
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith("2026-11-10T10:15");
  });

  it("says one hint and one error for the pair, on both parts", () => {
    render(
      <DateTimeField
        value=""
        onChange={vi.fn()}
        dateLabel="Tanggal"
        timeLabel="Jam"
        hint="Waktu pertemuan dengan siswa."
        error="Isi tanggal dan jam."
      />,
    );
    for (const name of ["Tanggal", "Jam"]) {
      const part = screen.getByRole("combobox", { name });
      expect(part).toHaveAttribute("aria-invalid", "true");
      expect(part).toHaveAccessibleDescription(
        "Waktu pertemuan dengan siswa. Isi tanggal dan jam.",
      );
    }
    expect(screen.getAllByText("Isi tanggal dan jam.")).toHaveLength(1);
  });
});
