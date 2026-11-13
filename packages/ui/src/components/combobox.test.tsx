import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Combobox } from "./combobox.js";
import { Select } from "./select.js";

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
    for (const shared of ["rounded-md", "h-11", "md:h-9", "border", "border-danger"]) {
      expect(combobox).toHaveClass(shared);
      expect(select).toHaveClass(shared);
    }
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
});
