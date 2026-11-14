import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";
import { pressArrow } from "../test/press-arrow.js";

import { SegmentedControl } from "./segmented-control.js";

const options = [
  { value: "all", label: "Semua", count: 24 },
  { value: "pending", label: "Menunggu", count: 3 },
  { value: "archived", label: "Arsip", disabled: true },
  { value: "approved", label: "Disetujui" },
];

describe("SegmentedControl", () => {
  it("is a radio group whose arrow keys move and select, skipping disabled segments", async () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Status izin"
        options={options}
        defaultValue="all"
        onValueChange={onValueChange}
      />,
    );

    expect(screen.getByRole("radiogroup", { name: "Status izin" })).toBeInTheDocument();
    const all = screen.getByRole("radio", { name: "Semua 24" });
    expect(all).toBeChecked();

    await userEvent.tab();
    expect(all).toHaveFocus();
    await pressArrow("ArrowRight");
    expect(onValueChange).toHaveBeenLastCalledWith("pending");
    await pressArrow("ArrowRight");
    expect(onValueChange).toHaveBeenLastCalledWith("approved");
    expect(screen.getByRole("radio", { name: "Disetujui" })).toBeChecked();
  });

  it("slides the indicator by index through CSS variables", async () => {
    render(<SegmentedControl aria-label="Mode" options={options} defaultValue="all" />);
    const group = screen.getByRole("radiogroup", { name: "Mode" });
    expect(group.style.getPropertyValue("--segment-count")).toBe("4");
    expect(group.style.getPropertyValue("--segment-index")).toBe("0");

    await userEvent.click(screen.getByRole("radio", { name: "Disetujui" }));
    expect(group.style.getPropertyValue("--segment-index")).toBe("3");
  });

  it("follows a controlled value and posts it under a name", () => {
    const { rerender } = render(
      <form aria-label="Filter">
        <SegmentedControl aria-label="Mode" options={options} value="all" name="status" />
      </form>,
    );
    rerender(
      <form aria-label="Filter">
        <SegmentedControl aria-label="Mode" options={options} value="pending" name="status" />
      </form>,
    );
    expect(screen.getByRole("radio", { name: "Menunggu 3" })).toBeChecked();
    const posted = screen
      .getByRole("form", { name: "Filter" })
      .querySelector<HTMLInputElement>('input[name="status"]:checked');
    expect(posted?.value).toBe("pending");
  });

  it("takes the ref, id and description FormControl hands a field", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <>
        <p id="status-hint">Pilih status yang ditampilkan</p>
        <SegmentedControl
          ref={ref}
          id="status"
          aria-label="Status izin"
          aria-describedby="status-hint"
          options={options}
          defaultValue="all"
        />
      </>,
    );
    const group = screen.getByRole("radiogroup", { name: "Status izin" });
    expect(ref.current).toBe(group);
    expect(group).toHaveAttribute("id", "status");
    expect(group).toHaveAccessibleDescription("Pilih status yang ditampilkan");
  });

  it("trims the side padding in the dense size and keeps the touch height", () => {
    const days = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((label, index) => ({
      value: String(index + 1),
      label,
    }));
    const { rerender } = render(
      <SegmentedControl aria-label="Hari" options={days} defaultValue="1" fullWidth />,
    );
    expect(screen.getByRole("radio", { name: "Sen" })).toHaveClass("px-4");
    rerender(
      <SegmentedControl aria-label="Hari" options={days} defaultValue="1" fullWidth size="dense" />,
    );
    const monday = screen.getByRole("radio", { name: "Sen" });
    expect(monday).toHaveClass("px-1.5", "gap-1", "h-8", "pointer-coarse:h-9");
    expect(monday).not.toHaveClass("px-4");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <SegmentedControl aria-label="Status izin" options={options} defaultValue="pending" />,
    );
    await expectNoAxeViolations(container);
  });
});
