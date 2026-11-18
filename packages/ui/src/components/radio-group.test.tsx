import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Monitor, Moon } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";
import { pressArrow } from "../test/press-arrow.js";
import { compiledSelector } from "../test/tailwind-selector.js";

import { RadioGroup, RadioGroupItem } from "./radio-group.js";

describe("RadioGroup", () => {
  it("selects through the label and moves with the arrow keys", async () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup aria-label="Baris nama sekolah" defaultValue="auto" onValueChange={onValueChange}>
        <RadioGroupItem value="auto" label="Otomatis" description="Dipilih dari nama sekolah" />
        <RadioGroupItem value="1" label="Baris 1" />
        <RadioGroupItem value="2" label="Baris 2" disabled />
      </RadioGroup>,
    );

    expect(screen.getByRole("radiogroup", { name: "Baris nama sekolah" })).toBeInTheDocument();
    const auto = screen.getByRole("radio", { name: "Otomatis" });
    expect(auto).toHaveAccessibleDescription("Dipilih dari nama sekolah");
    expect(auto).toBeChecked();

    await userEvent.click(screen.getByText("Baris 1"));
    expect(onValueChange).toHaveBeenLastCalledWith("1");
    expect(screen.getByRole("radio", { name: "Baris 1" })).toBeChecked();

    expect(screen.getByRole("radio", { name: "Baris 1" })).toHaveFocus();
    await pressArrow("ArrowUp");
    expect(auto).toHaveFocus();
    expect(onValueChange).toHaveBeenLastCalledWith("auto");
  });

  it("names option cards by title and describes them by their text", async () => {
    const { container } = render(
      <RadioGroup aria-label="Tema" variant="card" defaultValue="system">
        <RadioGroupItem
          value="system"
          label="Ikuti perangkat"
          description="Terang atau gelap mengikuti sistem"
          icon={<Monitor />}
        />
        <RadioGroupItem value="dark" label="Gelap" icon={<Moon />} />
      </RadioGroup>,
    );

    const card = screen.getByRole("radio", { name: "Ikuti perangkat" });
    expect(card).toHaveAccessibleDescription("Terang atau gelap mengikuti sistem");
    await userEvent.click(screen.getByRole("radio", { name: "Gelap" }));
    expect(screen.getByRole("radio", { name: "Gelap" })).toBeChecked();
    await expectNoAxeViolations(container);
  });

  it("looks disabled when the whole group is, labels and the checked dot included", async () => {
    render(
      <RadioGroup aria-label="Cakupan" defaultValue="class" disabled>
        <RadioGroupItem value="class" label="Per kelas" />
        <RadioGroupItem value="grade" label="Per angkatan" />
      </RadioGroup>,
    );
    const checked = screen.getByRole("radio", { name: "Per kelas" });
    expect(checked).toBeDisabled();
    const label = screen.getByText("Per kelas");
    expect(
      label.matches(await compiledSelector("group-has-disabled/radio:cursor-not-allowed")),
    ).toBe(true);
    const dot = checked.querySelector("span");
    if (!dot) throw new Error("Missing dot");
    expect(
      dot.matches(await compiledSelector("group-disabled:group-data-[state=checked]:opacity-50")),
    ).toBe(true);
  });

  // A plain `border` ring all but vanished on the sunken fill in dark.
  it("keeps a disabled ring at half the resting ring's strength", () => {
    render(
      <RadioGroup aria-label="Baris">
        <RadioGroupItem value="3" label="Baris 3" disabled />
      </RadioGroup>,
    );
    const dot = screen.getByRole("radio", { name: "Baris 3" }).querySelector("span");
    if (!dot) throw new Error("Missing dot");
    expect(dot).toHaveClass("group-disabled:border-border-strong/50");
    expect(dot).not.toHaveClass("group-disabled:border-border");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <RadioGroup aria-label="Cakupan" defaultValue="class" orientation="horizontal">
        <RadioGroupItem value="class" label="Per kelas" />
        <RadioGroupItem value="grade" label="Per angkatan" />
      </RadioGroup>,
    );
    await expectNoAxeViolations(container);
  });
});
