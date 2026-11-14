import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";
import { compiledSelector } from "../test/tailwind-selector.js";

import { Combobox } from "./combobox.js";
import { Dialog, DialogContent } from "./dialog.js";
import { Field } from "./field.js";
import { Select } from "./select.js";
import { UiLabelsProvider } from "./ui-labels.js";

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

  it("reads its placeholder from UiLabels and shows an option's description in the list", async () => {
    render(
      <UiLabelsProvider labels={{ selectPlaceholder: "Select" }}>
        <Select
          aria-label="Kelas"
          options={[{ value: "x-a", label: "X-A", description: "Wali: Bu Rina" }]}
        />
      </UiLabelsProvider>,
    );
    const trigger = screen.getByRole("combobox", { name: "Kelas" });
    expect(trigger).toHaveTextContent("Select");
    await userEvent.click(trigger);
    expect(screen.getByText("Wali: Bu Rina")).toBeInTheDocument();
  });

  it("is labelled, described and marked invalid by a surrounding Field", () => {
    render(
      <Field label="Kelas" error="Pilih salah satu">
        <Select options={[{ value: "x-a", label: "X-A" }]} />
      </Field>,
    );
    const trigger = screen.getByRole("combobox", { name: "Kelas" });
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger).toHaveAccessibleDescription("Pilih salah satu");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <Field label="Kelas" hint="Kelas aktif.">
        <Select options={[{ value: "x-a", label: "X-A" }]} />
      </Field>,
    );
    await expectNoAxeViolations(container);
  });
});

describe("Select and Combobox chevrons", () => {
  // Every Radix overlay carries data-state="open", so a chevron keyed to any
  // open ancestor would point up for good inside a dialog.
  it("turn only with their own trigger, not with an open Dialog around them", async () => {
    render(
      <Dialog open>
        <DialogContent title="Ubah kelas">
          <Select aria-label="Kelas" options={[{ value: "x-a", label: "X-A" }]} />
          <Combobox
            aria-label="Wali kelas"
            options={[{ value: "rina", label: "Rina" }]}
            value=""
            onValueChange={vi.fn()}
            search=""
            onSearchChange={vi.fn()}
          />
        </DialogContent>
      </Dialog>,
    );
    const select = screen.getByRole("combobox", { name: "Kelas" });
    const combobox = screen.getByRole("button", { name: "Wali kelas" });
    const turned = async (trigger: HTMLElement) => {
      const icon = trigger.querySelector("svg");
      if (!icon) throw new Error("Missing chevron");
      const rotate = Array.from(icon.classList).find((name) => name.endsWith(":rotate-180"));
      if (!rotate) throw new Error("Chevron has no open rotation");
      return icon.matches(await compiledSelector(rotate));
    };
    expect(await turned(select)).toBe(false);
    expect(await turned(combobox)).toBe(false);

    await userEvent.click(combobox);
    expect(await turned(combobox)).toBe(true);
    expect(await turned(select)).toBe(false);
  });
});
