import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { NumberInput, type NumberInputProps } from "./number-input.js";

function ControlledNumberInput(props: NumberInputProps) {
  const [value, setValue] = useState<number | null>(props.value ?? null);
  return (
    <>
      <label htmlFor="score">Nilai</label>
      <NumberInput
        id="score"
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

describe("NumberInput", () => {
  it("reads an Indonesian decimal comma, or a point, and never reports NaN", async () => {
    const onChange = vi.fn();
    render(<ControlledNumberInput step={0.1} onChange={onChange} />);
    const input = screen.getByRole("spinbutton", { name: "Nilai" });
    expect(input).toHaveAttribute("inputmode", "decimal");

    await userEvent.type(input, "8a5.5x");
    expect(input).toHaveValue("85,5");
    expect(onChange).toHaveBeenLastCalledWith(85.5);
    expect(onChange.mock.calls.every(([value]) => value === null || !Number.isNaN(value))).toBe(
      true,
    );

    await userEvent.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("rounds and clamps on blur", async () => {
    const onChange = vi.fn();
    render(<ControlledNumberInput min={0} max={100} onChange={onChange} />);
    const input = screen.getByRole("spinbutton", { name: "Nilai" });

    await userEvent.type(input, "140");
    expect(onChange).toHaveBeenLastCalledWith(140);
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith(100);
    expect(input).toHaveValue("100");
    expect(input).toHaveAttribute("aria-valuenow", "100");
    expect(input).toHaveAttribute("aria-valuemax", "100");
  });

  it("steps with the arrow keys and the stepper buttons, within bounds", async () => {
    const onChange = vi.fn();
    render(<ControlledNumberInput value={9} min={1} max={10} stepper onChange={onChange} />);
    const input = screen.getByRole("spinbutton", { name: "Nilai" });

    input.focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(onChange).toHaveBeenLastCalledWith(10);
    expect(screen.getByRole("button", { name: "Tambah" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Kurangi" }));
    await userEvent.click(screen.getByRole("button", { name: "Kurangi" }));
    expect(onChange).toHaveBeenLastCalledWith(8);
    expect(input).toHaveValue("8");
    expect(input).toHaveFocus();
  });

  it("groups thousands only while not editing, and posts the plain number", async () => {
    render(<ControlledNumberInput value={1500000} useGrouping prefix="Rp" name="fine" />);
    const input = screen.getByRole("spinbutton", { name: "Nilai" });

    expect(input).toHaveValue("1.500.000");
    expect(screen.getByText("Rp")).toBeInTheDocument();
    expect(document.querySelector<HTMLInputElement>('input[name="fine"]')?.value).toBe("1500000");
    await userEvent.click(input);
    expect(input).toHaveValue("1500000");
  });

  it("formats with a decimal point in English", () => {
    render(<ControlledNumberInput value={85.5} step={0.5} locale="en-US" />);
    expect(screen.getByRole("spinbutton", { name: "Nilai" })).toHaveValue("85.5");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <ControlledNumberInput value={3} min={0} max={10} stepper suffix="hari" />,
    );
    await expectNoAxeViolations(container);
  });
});
