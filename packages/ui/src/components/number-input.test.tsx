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
    expect(input).toHaveValue("85.5");
    expect(onChange).toHaveBeenLastCalledWith(85.5);
    expect(onChange.mock.calls.every(([value]) => value === null || !Number.isNaN(value))).toBe(
      true,
    );
    await userEvent.tab();
    expect(input).toHaveValue("85,5");

    await userEvent.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("reads grouping by the locale and drops a fraction in a whole-number field", async () => {
    const onChange = vi.fn();
    render(<ControlledNumberInput onChange={onChange} />);
    const input = screen.getByRole("spinbutton", { name: "Nilai" });

    await userEvent.type(input, "85,5");
    expect(onChange).toHaveBeenLastCalledWith(85);
    await userEvent.clear(input);
    await userEvent.type(input, "1.500.000");
    expect(onChange).toHaveBeenLastCalledWith(1500000);
    await userEvent.tab();
    expect(input).toHaveValue("1500000");
  });

  it("leaves a value that is only tabbed through untouched", async () => {
    const onChange = vi.fn();
    render(
      <>
        <ControlledNumberInput value={85.25} step={0.1} onChange={onChange} />
        <NumberInput aria-label="Hari" value={2.5} onChange={onChange} />
        <NumberInput aria-label="Sesi" value={0} min={1} max={10} onChange={onChange} />
      </>,
    );
    const score = screen.getByRole("spinbutton", { name: "Nilai" });
    // Shown in full: rounding is for what is typed, not for what is stored.
    expect(score).toHaveValue("85,25");
    expect(screen.getByRole("spinbutton", { name: "Hari" })).toHaveValue("2,5");

    score.focus();
    expect(score).toHaveValue("85,25");
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
    expect(score).toHaveValue("85,25");
  });

  it("rounds an edited over-precise value on blur", async () => {
    const onChange = vi.fn();
    render(<ControlledNumberInput value={85.25} step={0.1} onChange={onChange} />);
    const input = screen.getByRole("spinbutton", { name: "Nilai" });

    await userEvent.click(input);
    await userEvent.keyboard("{Home}{Delete}9");
    expect(input).toHaveValue("95,25");
    expect(onChange).toHaveBeenLastCalledWith(95.25);
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith(95.3);
    expect(input).toHaveValue("95,3");
  });

  it("offers the full keyboard only when negatives are asked for", () => {
    render(
      <>
        <NumberInput aria-label="Saldo" min={-100} />
        <NumberInput aria-label="Jumlah" />
      </>,
    );
    expect(screen.getByRole("spinbutton", { name: "Saldo" })).toHaveAttribute("inputmode", "text");
    expect(screen.getByRole("spinbutton", { name: "Jumlah" })).toHaveAttribute(
      "inputmode",
      "numeric",
    );
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
