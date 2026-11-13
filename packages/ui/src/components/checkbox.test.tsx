import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Checkbox } from "./checkbox.js";

describe("Checkbox", () => {
  it("toggles and reports the new state", async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox aria-label="Pilih baris" onCheckedChange={onCheckedChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Pilih baris" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("shows a partial selection as a filled box with a dash, not an empty box", () => {
    render(<Checkbox aria-label="Pilih semua baris" checked="indeterminate" />);
    const checkbox = screen.getByRole("checkbox", { name: "Pilih semua baris" });
    expect(checkbox).toHaveAttribute("aria-checked", "mixed");
    expect(checkbox).toHaveAttribute("data-state", "indeterminate");

    const box = checkbox.firstElementChild;
    expect(box).toHaveClass("group-data-[state=indeterminate]:bg-accent");
    expect(checkbox.querySelector(".lucide-minus")).toHaveClass(
      "group-data-[state=indeterminate]:block",
    );
    expect(checkbox.querySelector(".lucide-check")).toHaveClass(
      "group-data-[state=indeterminate]:hidden",
    );
  });

  it("draws its border in the 3:1 control border color", () => {
    render(<Checkbox aria-label="Pilih baris" />);
    expect(screen.getByRole("checkbox").firstElementChild).toHaveClass("border-border-strong");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<Checkbox aria-label="Pilih baris" defaultChecked />);
    await expectNoAxeViolations(container);
  });
});
