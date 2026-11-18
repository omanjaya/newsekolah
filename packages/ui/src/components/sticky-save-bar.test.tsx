import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { StickySaveBar } from "./sticky-save-bar.js";

describe("StickySaveBar", () => {
  it("saves on click and stops taking clicks while saving", async () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <StickySaveBar leadingSlot="3 perubahan" saveLabel="Simpan" saving={false} onSave={onSave} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(onSave).toHaveBeenCalledTimes(1);

    rerender(<StickySaveBar leadingSlot="3 perubahan" saveLabel="Simpan" saving onSave={onSave} />);
    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
  });

  it("lines up with the page gutter and slides up as it appears", () => {
    const { container } = render(
      <StickySaveBar
        leadingSlot="3 perubahan"
        saveLabel="Simpan"
        saving={false}
        onSave={vi.fn()}
      />,
    );
    const bar = container.firstElementChild;
    expect(bar).toHaveClass("px-4", "md:px-6", "animate-rise-in");
    expect(bar?.firstElementChild).not.toHaveClass("max-w-5xl");
  });

  // Anchored at the shell's full offset, the bar floated 32px (the centre
  // button's rise) above the phone's tab bar with the page showing between.
  it("docks on the phone's tab bar and pads its rise instead of floating above it", () => {
    const { container } = render(
      <StickySaveBar
        leadingSlot="3 perubahan"
        saveLabel="Simpan"
        saving={false}
        onSave={vi.fn()}
      />,
    );
    const bar = container.firstElementChild;
    expect(bar).toHaveClass(
      "bottom-[calc(var(--shell-mobile-tab-bar,0px)+env(safe-area-inset-bottom))]",
      "pb-[calc(var(--space-3)+var(--shell-mobile-tab-raise,0px))]",
      "md:bottom-0",
      "md:pb-3",
    );
    expect(bar?.className).not.toContain("--shell-mobile-tab-offset");
  });

  it("can match a PageShell container instead of the full width", () => {
    const { container } = render(
      <StickySaveBar
        leadingSlot="3 perubahan"
        saveLabel="Simpan"
        saving={false}
        onSave={vi.fn()}
        container="default"
      />,
    );
    expect(container.firstElementChild?.firstElementChild).toHaveClass("mx-auto", "max-w-default");
  });

  // A narrow page's content starts at the default column's left edge
  // (PageShell), so a centred narrow bar would sit 240px right of the form.
  it("lines a narrow bar up with a narrow page's left-aligned content", () => {
    const { container } = render(
      <StickySaveBar
        leadingSlot="3 perubahan"
        saveLabel="Simpan"
        saving={false}
        onSave={vi.fn()}
        container="narrow"
      />,
    );
    const column = container.firstElementChild?.firstElementChild;
    expect(column).toHaveClass("mx-auto", "max-w-default");
    expect(column?.firstElementChild).toHaveClass("max-w-narrow");
    expect(column?.firstElementChild).not.toHaveClass("mx-auto");
  });

  it("publishes its height for the toasts while it is shown", () => {
    const { unmount } = render(
      <StickySaveBar
        leadingSlot="3 perubahan"
        saveLabel="Simpan"
        saving={false}
        onSave={vi.fn()}
      />,
    );
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--sticky-save-bar-height")).toMatch(/px$/);
    unmount();
    expect(root.style.getPropertyValue("--sticky-save-bar-height")).toBe("");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <StickySaveBar
        leadingSlot="3 perubahan"
        saveLabel="Simpan"
        saving={false}
        onSave={vi.fn()}
      />,
    );
    await expectNoAxeViolations(container);
  });
});
