import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Field } from "./field.js";
import { Switch } from "./switch.js";

describe("Switch", () => {
  it("toggles on click and Space", async () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Notifikasi WhatsApp" onCheckedChange={onCheckedChange} />);
    const control = screen.getByRole("switch", { name: "Notifikasi WhatsApp" });
    expect(control).not.toBeChecked();
    await userEvent.click(control);
    expect(control).toBeChecked();
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    await userEvent.keyboard(" ");
    expect(control).not.toBeChecked();
  });

  it("does not toggle while disabled", async () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch aria-label="Aplikasi" defaultChecked disabled onCheckedChange={onCheckedChange} />,
    );
    await userEvent.click(screen.getByRole("switch", { name: "Aplikasi" }));
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: "Aplikasi" })).toBeChecked();
  });

  it("is a pill with a 3:1 ring when off and a 44px hit area on a touch screen", () => {
    render(<Switch aria-label="Email" />);
    const control = screen.getByRole("switch", { name: "Email" });
    expect(control).toHaveClass("rounded-full", "border-border-strong", "pointer-coarse:w-11");
    expect(control.className).toMatch(/pointer-coarse:after:-inset-y-2\.5/);
  });

  it("is labelled, described, disabled and marked invalid by a surrounding Field", async () => {
    const onCheckedChange = vi.fn();
    const { container, rerender } = render(
      <Field label="Terbitkan nilai" hint="Siswa melihat nilai setelah terbit.">
        <Switch onCheckedChange={onCheckedChange} />
      </Field>,
    );
    const control = screen.getByRole("switch", { name: "Terbitkan nilai" });
    expect(control).toHaveAccessibleDescription("Siswa melihat nilai setelah terbit.");
    // The Field's label toggles the switch, as a native label would.
    await userEvent.click(screen.getByText("Terbitkan nilai"));
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    await expectNoAxeViolations(container);

    rerender(
      <Field label="Terbitkan nilai" error="Lengkapi nilai dulu." disabled>
        <Switch onCheckedChange={onCheckedChange} />
      </Field>,
    );
    const disabled = screen.getByRole("switch", { name: "Terbitkan nilai" });
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveAttribute("aria-invalid", "true");
    expect(disabled).toHaveAccessibleDescription(/Lengkapi nilai dulu\./);
  });

  it("keeps its own id and label outside a Field", () => {
    render(
      <>
        <Switch id="push" />
        <label htmlFor="push">Notifikasi</label>
      </>,
    );
    expect(screen.getByRole("switch", { name: "Notifikasi" })).toHaveAttribute("id", "push");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<Switch aria-label="Notifikasi email" defaultChecked />);
    await expectNoAxeViolations(container);
  });
});
