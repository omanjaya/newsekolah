import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";
import { endExitAnimation, playExitAnimations } from "../test/exit-animation.js";

import { CommandPalette, type CommandPaletteGroup } from "./command-palette.js";
import { UiLabelsProvider } from "./ui-labels.js";

function groups(onSelect: () => void): CommandPaletteGroup[] {
  return [
    {
      heading: "Halaman",
      items: [
        { id: "attendance", label: "Presensi", onSelect, icon: <svg />, shortcut: "G P" },
        { id: "library", label: "Perpustakaan", onSelect },
      ],
    },
  ];
}

describe("CommandPalette", () => {
  it("lists the groups and runs the chosen item", async () => {
    const onSelect = vi.fn();
    render(<CommandPalette open onOpenChange={vi.fn()} groups={groups(onSelect)} />);
    expect(screen.getByText("Halaman")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: /Perpustakaan/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("filters as the reader types and reports the text to the caller", async () => {
    const onSearchChange = vi.fn();
    render(
      <CommandPalette
        open
        onOpenChange={vi.fn()}
        groups={groups(vi.fn())}
        onSearchChange={onSearchChange}
      />,
    );
    await userEvent.type(screen.getByRole("combobox"), "perpus");
    expect(onSearchChange).toHaveBeenLastCalledWith("perpus");
    expect(screen.queryByRole("option", { name: /Presensi/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Perpustakaan/ })).toBeInTheDocument();
  });

  it("fades its scrim out with the panel at the dialog's 120ms", () => {
    const restore = playExitAnimations();
    try {
      const { rerender } = render(
        <CommandPalette open onOpenChange={vi.fn()} groups={groups(vi.fn())} />,
      );
      rerender(<CommandPalette open={false} onOpenChange={vi.fn()} groups={groups(vi.fn())} />);
      const scrim = document.querySelector(".bg-scrim");
      expect(scrim).toHaveAttribute("data-state", "closed");
      expect(scrim).toHaveClass("data-[state=closed]:animate-overlay-out");
      endExitAnimation(scrim);
      expect(document.querySelector(".bg-scrim")).toBeNull();
    } finally {
      restore();
    }
  });

  it("takes its built-in texts from UiLabels", () => {
    render(
      <UiLabelsProvider
        labels={{
          commandPaletteLabel: "Global search",
          commandPalettePlaceholder: "Search pages",
          commandPaletteHintOpen: "Open",
          commandPaletteCancel: "Cancel",
        }}
      >
        <CommandPalette open onOpenChange={vi.fn()} groups={groups(vi.fn())} />
      </UiLabelsProvider>,
    );
    expect(screen.getByRole("dialog", { name: "Global search" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search pages")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("closes from the phone's cancel button", async () => {
    const onOpenChange = vi.fn();
    render(<CommandPalette open onOpenChange={onOpenChange} groups={groups(vi.fn())} />);
    await userEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("has no accessibility violations", async () => {
    render(<CommandPalette open onOpenChange={vi.fn()} groups={groups(vi.fn())} />);
    await expectNoAxeViolations(screen.getByRole("dialog"));
  });
});
