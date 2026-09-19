import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AttendanceStatusRadioGroup } from "./attendance-status-radio-group";

describe("AttendanceStatusRadioGroup", () => {
  it("uses roving focus and selects status with arrow keys", async () => {
    const onChange = vi.fn();
    render(
      <AttendanceStatusRadioGroup
        label="Student name"
        value="H"
        disabled={false}
        onChange={onChange}
        statuses={[
          { code: "H", label: "Present", color: "green", counts_as_present: true },
          { code: "S", label: "Sick", color: "yellow", counts_as_present: false },
          { code: "A", label: "Absent", color: "red", counts_as_present: false },
        ]}
      />,
    );

    const present = screen.getByRole("radio", { name: "Present" });
    const sick = screen.getByRole("radio", { name: "Sick" });
    expect(present).toHaveAttribute("tabindex", "0");
    expect(sick).toHaveAttribute("tabindex", "-1");

    present.focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenCalledWith("S");
    expect(sick).toHaveFocus();
  });
});
