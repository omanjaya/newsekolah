import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("has no accessibility violations", async () => {
    const { container } = render(
      <SegmentedControl aria-label="Status izin" options={options} defaultValue="pending" />,
    );
    await expectNoAxeViolations(container);
  });
});
