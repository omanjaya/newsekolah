import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Select } from "./select.js";

describe("Select", () => {
  it("forwards trigger identity and accessible descriptions, then selects an option", async () => {
    const onValueChange = vi.fn();
    render(
      <>
        <label htmlFor="class-select">Kelas</label>
        <p id="class-help">Pilih kelas aktif</p>
        <Select
          id="class-select"
          aria-describedby="class-help"
          options={[
            { value: "x-a", label: "X-A" },
            { value: "x-b", label: "X-B" },
          ]}
          onValueChange={onValueChange}
        />
      </>,
    );

    const trigger = screen.getByRole("combobox", { name: "Kelas" });
    expect(trigger).toHaveAttribute("id", "class-select");
    expect(trigger).toHaveAttribute("aria-describedby", "class-help");

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("option", { name: "X-B" }));

    expect(onValueChange).toHaveBeenCalledWith("x-b");
    expect(trigger).toHaveTextContent("X-B");
  });

  it("uses an explicit aria-label when no visible label is available", () => {
    render(<Select aria-label="Pilih ruang" options={[{ value: "lab", label: "Lab" }]} />);
    expect(screen.getByRole("combobox", { name: "Pilih ruang" })).toBeInTheDocument();
  });
});
