import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Combobox } from "./combobox.js";
import { Select } from "./select.js";
import { UiLabelsProvider } from "./ui-labels.js";

const OPTIONS = [
  { value: "siti", label: "Siti Aminah", description: "siti" },
  { value: "budi", label: "Budi Santoso" },
];

function Harness({ onValueChange }: { onValueChange: (value: string) => void }) {
  const [value, setValue] = useState("");
  const [search, setSearch] = useState("");
  return (
    <Combobox
      aria-label="Guru pengganti"
      options={OPTIONS}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
      search={search}
      onSearchChange={setSearch}
      emptyLabel="Tidak ada guru"
    />
  );
}

describe("Combobox", () => {
  it("selects an option and shows it on the trigger", async () => {
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);
    const trigger = screen.getByRole("button", { name: "Guru pengganti" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("option", { name: /Budi Santoso/ }));
    expect(onValueChange).toHaveBeenCalledWith("budi");
    expect(trigger).toHaveTextContent("Budi Santoso");
  });

  it("looks like Select: same radius, height, border and invalid color", () => {
    render(
      <>
        <Combobox
          aria-label="Guru pengganti"
          options={OPTIONS}
          value=""
          onValueChange={vi.fn()}
          search=""
          onSearchChange={vi.fn()}
          emptyLabel="Tidak ada guru"
          invalid
        />
        <Select aria-label="Kelas" options={[{ value: "x-a", label: "X-A" }]} invalid />
      </>,
    );
    const combobox = screen.getByRole("button", { name: "Guru pengganti" });
    const select = screen.getByRole("combobox", { name: "Kelas" });
    for (const shared of [
      "rounded-md",
      "h-11",
      "md:pointer-fine:h-9",
      "border",
      "border-(--field-border)",
      "aria-invalid:[--field-border:var(--color-danger)]",
    ]) {
      expect(combobox).toHaveClass(shared);
      expect(select).toHaveClass(shared);
    }
    expect(combobox).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAttribute("aria-invalid", "true");
  });

  it("lets the list, not the search field, give way when the room on screen is short", async () => {
    render(<Harness onValueChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Guru pengganti" }));
    const list = screen.getByRole("listbox");
    const content = list.closest("[data-state]");
    expect(content).toHaveClass("flex", "flex-col");
    expect(list).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
    // The search row (glass, input, spinner) keeps its height.
    expect(screen.getByRole("combobox").parentElement).toHaveClass("shrink-0");
  });

  it("caps the open list to the trigger's width and the room left on screen", async () => {
    render(<Harness onValueChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Guru pengganti" }));
    const list = screen.getByRole("listbox").closest("[data-state]");
    expect(list).toHaveClass(
      "w-(--radix-popover-trigger-width)",
      "max-h-(--radix-popover-content-available-height)",
    );
  });

  function Bare(props: { loading?: boolean }) {
    return (
      <Combobox
        aria-label="Guru"
        options={[]}
        value=""
        onValueChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        loading={props.loading}
      />
    );
  }

  it("says it is loading while a search with no results yet is in flight", async () => {
    render(<Bare loading />);
    await userEvent.click(screen.getByRole("button", { name: "Guru" }));
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Memuat pilihan")).toBeInTheDocument();
  });

  it("falls back to the UiLabels empty and placeholder text", async () => {
    render(
      <UiLabelsProvider labels={{ comboboxEmpty: "Nothing matches", comboboxPlaceholder: "Pick" }}>
        <Bare />
      </UiLabelsProvider>,
    );
    const trigger = screen.getByRole("button", { name: "Guru" });
    expect(trigger).toHaveTextContent("Pick");
    await userEvent.click(trigger);
    expect(screen.getByText("Nothing matches")).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<Harness onValueChange={vi.fn()} />);
    await expectNoAxeViolations(container);
  });
});
