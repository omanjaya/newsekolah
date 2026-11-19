import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { DayStepper, shiftDate } from "./day-stepper";

const LABELS = {
  previous: "Hari sebelumnya",
  next: "Hari berikutnya",
  today: "Hari ini",
  date: "Tanggal",
};

function Stepper({ initial }: { initial: string }): ReactElement {
  const [value, setValue] = useState(initial);
  return <DayStepper value={value} onChange={setValue} today="2026-11-20" labels={LABELS} />;
}

describe("DayStepper", () => {
  it("shifts a date by whole days across a month end", () => {
    expect(shiftDate("2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("hands focus to the date when 'Hari ini' removes itself", async () => {
    const user = userEvent.setup();
    render(<Stepper initial="2026-07-04" />);
    screen.getByRole("button", { name: "Hari ini" }).focus();

    await user.keyboard("{Enter}");

    expect(screen.queryByRole("button", { name: "Hari ini" })).not.toBeInTheDocument();
    // Without the hand-off focus falls to <body> once the button unmounts.
    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole("combobox", { name: "Tanggal" })).toHaveFocus();
  });

  it("offers 'Hari ini' only away from today", async () => {
    const user = userEvent.setup();
    render(<Stepper initial="2026-11-20" />);
    expect(screen.queryByRole("button", { name: "Hari ini" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hari berikutnya" }));
    expect(screen.getByRole("button", { name: "Hari ini" })).toBeInTheDocument();
  });
});
