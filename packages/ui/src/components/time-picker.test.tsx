import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { TimePicker, type TimePickerProps } from "./time-picker.js";

function LabelledTimePicker(props: TimePickerProps) {
  const [value, setValue] = useState(props.value ?? "");
  return (
    <>
      <label htmlFor="start-time">Jam mulai</label>
      <TimePicker
        id="start-time"
        {...props}
        value={value}
        onChange={(next) => {
          setValue(next);
          props.onChange?.(next);
        }}
      />
      <button type="button">Berikutnya</button>
    </>
  );
}

describe("TimePicker", () => {
  it("ends a placeholder that does not fit with an ellipsis, as DatePicker does", () => {
    render(<LabelledTimePicker placeholder="Jam datang" />);
    const input = screen.getByRole("combobox", { name: "Jam mulai" });

    expect(input).toHaveAttribute("placeholder", "Jam datang");
    expect(input).toHaveClass("text-ellipsis");
  });

  it("normalises a typed time on blur and shows the Indonesian separator", async () => {
    const onChange = vi.fn();
    render(<LabelledTimePicker onChange={onChange} name="start" />);
    const input = screen.getByRole("combobox", { name: "Jam mulai" });

    await userEvent.type(input, "730");
    await userEvent.tab();

    expect(onChange).toHaveBeenLastCalledWith("07:30");
    expect(input).toHaveValue("07.30");
    expect(document.querySelector<HTMLInputElement>('input[name="start"]')?.value).toBe("07:30");
  });

  it("keeps the last valid time when the text cannot be read, and empties on clear", async () => {
    const onChange = vi.fn();
    render(<LabelledTimePicker value="08:00" onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Jam mulai" });

    await userEvent.clear(input);
    await userEvent.type(input, "25.99");
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("08.00");

    await userEvent.clear(input);
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("picks from the list of steps with the keyboard, within min and max", async () => {
    const onChange = vi.fn();
    render(
      <LabelledTimePicker
        value="07:15"
        min="07:00"
        max="08:00"
        minuteStep={15}
        onChange={onChange}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Jam mulai" });
    input.focus();

    await userEvent.keyboard("{ArrowDown}");
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "07.00",
      "07.15",
      "07.30",
      "07.45",
      "08.00",
    ]);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-activedescendant", options[1]?.id);
    expect(options[1]).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("07:45");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it("commits a typed time off the step grid on Enter, not the next suggestion", async () => {
    const onChange = vi.fn();
    render(<LabelledTimePicker onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Jam mulai" });

    await userEvent.type(input, "0740");
    // The list follows the typing but nothing is highlighted for Enter to take.
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-activedescendant");
    await userEvent.keyboard("{Enter}");

    expect(onChange).toHaveBeenLastCalledWith("07:40");
    expect(input).toHaveValue("07.40");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("lands the first arrow press after typing on the suggestion the list scrolled to", async () => {
    const onChange = vi.fn();
    render(<LabelledTimePicker onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Jam mulai" });

    await userEvent.type(input, "0740");
    await userEvent.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: "07.45" }).id,
    );
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("07:45");
  });

  it("reads an API time with seconds and posts it without them", () => {
    render(<LabelledTimePicker value="07:45:00" name="start" />);
    expect(screen.getByRole("combobox", { name: "Jam mulai" })).toHaveValue("07.45");
    expect(document.querySelector<HTMLInputElement>('input[name="start"]')?.value).toBe("07:45");
  });

  it("clamps a typed time to the bounds", async () => {
    const onChange = vi.fn();
    render(<LabelledTimePicker min="07:00" max="15:00" onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Jam mulai" });

    await userEvent.type(input, "6");
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith("07:00");
  });

  it("selects an option with the pointer", async () => {
    const onChange = vi.fn();
    render(<LabelledTimePicker minuteStep={30} onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Tampilkan pilihan jam" }));
    await userEvent.click(screen.getByRole("option", { name: "09.30" }));

    expect(onChange).toHaveBeenLastCalledWith("09:30");
    expect(screen.getByRole("combobox", { name: "Jam mulai" })).toHaveFocus();
  });

  it("has no accessibility violations, closed or open", async () => {
    const { container } = render(<LabelledTimePicker value="07:30" />);
    await expectNoAxeViolations(container);
    await userEvent.click(screen.getByRole("combobox", { name: "Jam mulai" }));
    await expectNoAxeViolations(container);
    await expectNoAxeViolations(screen.getByRole("listbox"));
  });
});
