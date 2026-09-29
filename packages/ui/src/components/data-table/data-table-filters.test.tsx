import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../../test/axe.js";

import { DataTableFilters, type DataTableFilterDef } from "./data-table-filters.js";

function materialTypeFilter(overrides: Partial<DataTableFilterDef> = {}): DataTableFilterDef {
  return {
    id: "materialType",
    label: "Jenis bahan",
    value: "",
    onChange: vi.fn(),
    options: [
      { value: "book", label: "Buku" },
      { value: "magazine", label: "Majalah" },
    ],
    ...overrides,
  };
}

function availabilityFilter(overrides: Partial<DataTableFilterDef> = {}): DataTableFilterDef {
  return {
    id: "availability",
    label: "Hanya tersedia",
    value: "",
    onChange: vi.fn(),
    type: "boolean",
    activeValue: "available",
    ...overrides,
  };
}

describe("DataTableFilters", () => {
  it("shows only the label for an unset filter, with no remove control", () => {
    render(<DataTableFilters filters={[materialTypeFilter()]} />);
    expect(screen.getByRole("button", { name: "Jenis bahan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hapus filter/ })).not.toBeInTheDocument();
  });

  it("opens the popover and applies the chosen option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DataTableFilters filters={[materialTypeFilter({ onChange })]} />);

    await user.click(screen.getByRole("button", { name: "Jenis bahan" }));
    const option = await screen.findByRole("button", { name: "Buku" });
    await user.click(option);

    expect(onChange).toHaveBeenCalledWith("book");
  });

  it("renders an active select filter as a chip with its value and a remove control", () => {
    render(<DataTableFilters filters={[materialTypeFilter({ value: "book" })]} />);
    expect(screen.getByRole("button", { name: "Jenis bahan: Buku" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hapus filter Jenis bahan" })).toBeInTheDocument();
  });

  it("clears just that filter when its chip's remove control is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DataTableFilters filters={[materialTypeFilter({ value: "book", onChange })]} />);

    await user.click(screen.getByRole("button", { name: "Hapus filter Jenis bahan" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("toggles a boolean filter directly, with no popover", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DataTableFilters filters={[availabilityFilter({ onChange })]} />);

    const toggle = screen.getByRole("button", { name: "Hanya tersedia" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(onChange).toHaveBeenCalledWith("available");
  });

  it("turns an active boolean filter off from its own remove control", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DataTableFilters filters={[availabilityFilter({ value: "available", onChange })]} />);

    expect(screen.getByRole("button", { name: "Hanya tersedia" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Hapus filter Hanya tersedia" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("only shows Reset filter once a filter is active, and clears every active filter at once", async () => {
    const user = userEvent.setup();
    const onMaterialChange = vi.fn();
    const onAvailabilityChange = vi.fn();
    const { rerender } = render(
      <DataTableFilters filters={[materialTypeFilter({ onChange: onMaterialChange })]} />,
    );
    expect(screen.queryByRole("button", { name: "Reset filter" })).not.toBeInTheDocument();

    rerender(
      <DataTableFilters
        filters={[
          materialTypeFilter({ value: "book", onChange: onMaterialChange }),
          availabilityFilter({ value: "available", onChange: onAvailabilityChange }),
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Reset filter" }));
    expect(onMaterialChange).toHaveBeenCalledWith("");
    expect(onAvailabilityChange).toHaveBeenCalledWith("");
  });

  it("is keyboard operable: Tab to a pill, Enter opens it, Enter on an option applies it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DataTableFilters filters={[materialTypeFilter({ onChange })]} />);

    await user.tab();
    expect(screen.getByRole("button", { name: "Jenis bahan" })).toHaveFocus();
    await user.keyboard("{Enter}");
    const option = await screen.findByRole("button", { name: "Majalah" });
    option.focus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("magazine");
  });

  it("has no accessibility violations with active and inactive filters", async () => {
    const { container } = render(
      <DataTableFilters filters={[materialTypeFilter({ value: "book" }), availabilityFilter()]} />,
    );
    await expectNoAxeViolations(container);
  });
});
