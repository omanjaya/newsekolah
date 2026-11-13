import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

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

  it("has no accessibility violations", async () => {
    const { container } = render(<Switch aria-label="Notifikasi email" defaultChecked />);
    await expectNoAxeViolations(container);
  });
});
