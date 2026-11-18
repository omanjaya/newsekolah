import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import {
  Disclosure,
  DisclosureContent,
  DisclosureIndicator,
  DisclosureTrigger,
} from "./disclosure.js";
import { Field } from "./field.js";
import { Input } from "./input.js";

describe("Disclosure", () => {
  it("opens and closes its content from a real button that says so", async () => {
    const onOpenChange = vi.fn();
    const { container } = render(
      <Disclosure onOpenChange={onOpenChange}>
        <DisclosureTrigger>
          Lanjutan <DisclosureIndicator />
        </DisclosureTrigger>
        <DisclosureContent>
          <Field label="Kode tahap">
            <Input defaultValue="wali_kelas" />
          </Field>
        </DisclosureContent>
      </Disclosure>,
    );
    const trigger = screen.getByRole("button", { name: "Lanjutan" });
    expect(trigger).toHaveAttribute("type", "button");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    // Closed content stays in the page, hidden, so nothing typed is lost.
    expect(screen.queryByRole("textbox", { name: "Kode tahap" })).not.toBeInTheDocument();
    const content = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
    expect(content).toHaveAttribute("hidden");
    await expectNoAxeViolations(container);

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("data-state", "open");
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("textbox", { name: "Kode tahap" })).toHaveValue("wali_kelas");
    expect(content).not.toHaveAttribute("hidden");
    await expectNoAxeViolations(container);
  });

  it("toggles from the keyboard and turns its indicator", async () => {
    render(
      <Disclosure defaultOpen>
        <DisclosureTrigger>
          Absensi <DisclosureIndicator />
        </DisclosureTrigger>
        <DisclosureContent>Isi</DisclosureContent>
      </Disclosure>,
    );
    const trigger = screen.getByRole("button", { name: "Absensi" });
    const indicator = trigger.querySelector("svg");
    expect(indicator).toHaveClass("rotate-180", "motion-indicator");
    await userEvent.tab();
    expect(trigger).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(indicator).not.toHaveClass("rotate-180");
    await userEvent.keyboard(" ");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("follows a controlled open state, held open by the caller", async () => {
    // A stage whose code clashes stays open on it, whatever was clicked.
    function Stage({ keyError }: { keyError: boolean }) {
      const [open, setOpen] = useState(false);
      return (
        <Disclosure open={open || keyError} onOpenChange={setOpen}>
          <DisclosureTrigger>Tahap 1</DisclosureTrigger>
          <DisclosureContent>Formulir tahap</DisclosureContent>
        </Disclosure>
      );
    }
    render(<Stage keyError />);
    const trigger = screen.getByRole("button", { name: "Tahap 1" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Formulir tahap")).toBeVisible();
  });

  it("renders onto its own elements and stops toggling while disabled", async () => {
    render(
      <Disclosure disabled>
        <DisclosureTrigger className="flex min-h-12 w-full">Izin kelas</DisclosureTrigger>
        <DisclosureContent asChild>
          <ul>
            <li>Lihat kelas</li>
          </ul>
        </DisclosureContent>
      </Disclosure>,
    );
    const trigger = screen.getByRole("button", { name: "Izin kelas" });
    expect(trigger).toHaveClass("min-h-12", "w-full", "text-left");
    expect(trigger).toBeDisabled();
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    const list = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
    expect(list?.tagName).toBe("UL");
    expect(list).toHaveAttribute("hidden");
  });

  it("refuses parts used outside a Disclosure", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<DisclosureTrigger>Lepas</DisclosureTrigger>)).toThrow(
      "DisclosureTrigger must be used inside a Disclosure",
    );
    error.mockRestore();
  });
});
