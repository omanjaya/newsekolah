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

  it("takes a visible label that toggles it and a description that describes it", async () => {
    const onCheckedChange = vi.fn();
    render(
      <Checkbox
        label="Kirim ke orang tua"
        description="Lewat WhatsApp."
        onCheckedChange={onCheckedChange}
      />,
    );
    const checkbox = screen.getByRole("checkbox", { name: "Kirim ke orang tua" });
    expect(checkbox).toHaveAccessibleDescription("Lewat WhatsApp.");
    await userEvent.click(screen.getByText("Kirim ke orang tua"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("marks an invalid box for assistive tech and in its border", () => {
    render(<Checkbox label="Setuju" invalid />);
    const checkbox = screen.getByRole("checkbox", { name: "Setuju" });
    expect(checkbox).toHaveAttribute("aria-invalid", "true");
    expect(checkbox.firstElementChild).toHaveClass("group-aria-invalid:border-danger");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <div>
        <Checkbox aria-label="Pilih baris" defaultChecked />
        <Checkbox label="Tampilkan arsip" description="Termasuk yang lama." disabled />
      </div>,
    );
    await expectNoAxeViolations(container);
  });
});
