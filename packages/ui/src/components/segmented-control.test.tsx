import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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

  describe("with a laid-out strip", () => {
    // jsdom has no layout: each segment reports the box a browser gave it
    // at its label's own width (the inbox's kinds at 768px: 68, 149, 112
    // and 144px after the track's 4px padding).
    const boxes: Record<string, { left: number; width: number }> = {
      Semua: { left: 4, width: 68 },
      "Izin tidak masuk": { left: 72, width: 149 },
      "Izin keluar": { left: 221, width: 112 },
      Keterlambatan: { left: 333, width: 144 },
    };
    const kinds = Object.keys(boxes).map((label, index) => ({
      value: String(index),
      label,
      count: index === 0 ? undefined : 1,
    }));
    const geometry = ["offsetLeft", "offsetTop", "offsetWidth", "offsetHeight"] as const;
    const originals = new Map<string, PropertyDescriptor | undefined>();
    const boxOf = (element: HTMLElement) =>
      element.getAttribute("role") === "radio"
        ? boxes[element.textContent.replace(/\s*\d+$/, "")]
        : undefined;

    beforeAll(() => {
      for (const key of geometry) {
        originals.set(key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key));
        Object.defineProperty(HTMLElement.prototype, key, {
          configurable: true,
          get(this: HTMLElement) {
            const box = boxOf(this);
            if (!box) return 0;
            if (key === "offsetLeft") return box.left;
            if (key === "offsetWidth") return box.width;
            return key === "offsetTop" ? 4 : 32;
          },
        });
      }
    });

    afterAll(() => {
      for (const key of geometry) {
        const original = originals.get(key);
        if (original) Object.defineProperty(HTMLElement.prototype, key, original);
      }
    });

    it("measures the raised pill from the checked segment, not from an equal share", async () => {
      render(<SegmentedControl aria-label="Jenis" size="sm" options={kinds} defaultValue="0" />);
      const group = screen.getByRole("radiogroup", { name: "Jenis" });
      const indicator = group.querySelector<HTMLElement>(":scope > [aria-hidden=true]");
      expect(group).toHaveAttribute("data-indicator", "ready");
      expect(indicator?.style.getPropertyValue("--indicator-x")).toBe("4px");
      expect(indicator?.style.getPropertyValue("--indicator-w")).toBe("68px");

      await userEvent.click(screen.getByRole("radio", { name: "Keterlambatan 1" }));
      // Where the last segment really is: an equal quarter of the 472px
      // would have put it at 358px, 118px wide.
      expect(indicator?.style.getPropertyValue("--indicator-x")).toBe("333px");
      expect(indicator?.style.getPropertyValue("--indicator-w")).toBe("144px");
    });
  });

  it("paints the checked segment's own pill until the sliding one is placed", () => {
    // Unmeasured (jsdom, or a strip in a hidden panel): no ready mark.
    render(<SegmentedControl aria-label="Mode" options={options} defaultValue="all" />);
    expect(screen.getByRole("radiogroup", { name: "Mode" })).not.toHaveAttribute("data-indicator");
    expect(screen.getByRole("radio", { name: "Semua 24" }).className).toContain(
      "[[data-strip]:not([data-indicator=ready])_&]:data-[state=checked]:bg-surface-raised",
    );
  });

  // A FilterBar that stacks stretches the strip to its own width. Equal
  // columns (an `auto-cols-fr` grid at least `min-w-max` wide) made the
  // inbox's four kinds need four times the longest label, 601px, so a
  // 480px tablet bar hid "Keterlambatan" past its edge.
  it("sizes each segment from its own label, so a stretched strip needs only their sum", () => {
    render(<SegmentedControl aria-label="Jenis" options={options} defaultValue="all" fullWidth />);
    const group = screen.getByRole("radiogroup", { name: "Jenis" });
    // The radiogroup is the scroller itself: the segments are its flex items.
    expect(group).toHaveClass("flex", "overflow-x-auto", "min-w-0");
    expect(group).not.toHaveClass("grid", "auto-cols-fr", "min-w-max", "w-max");
    for (const segment of screen.getAllByRole("radio")) {
      // Grow from a zero basis, never below the label (no min-w-0) and
      // never kept from growing (no shrink-0 left over).
      expect(segment).toHaveClass("flex-1");
      expect(segment).not.toHaveClass("min-w-0", "shrink-0", "basis-auto");
    }
  });

  // The clear band and the longer fades are for strips that draw edge
  // chevrons (Tabs, NavTabs). A segmented control has no chevrons, so a
  // band there would only hide the edge labels.
  it("keeps the plain edge fade, with no clear band for edge cues", () => {
    render(<SegmentedControl aria-label="Mode" options={options} defaultValue="all" />);
    const scroller = screen.getByRole("radiogroup", { name: "Mode" }).closest(".scroll-fade-x");
    expect(scroller).not.toBeNull();
    expect(scroller?.className).not.toContain("--scroll-fade-clear");
    expect(scroller?.className).not.toContain("--scroll-fade-start-size");
    expect(scroller?.className).not.toContain("--scroll-fade-end-size");
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

  it("takes the ref, id and description FormControl hands a field", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <>
        <p id="status-hint">Pilih status yang ditampilkan</p>
        <SegmentedControl
          ref={ref}
          id="status"
          aria-label="Status izin"
          aria-describedby="status-hint"
          options={options}
          defaultValue="all"
        />
      </>,
    );
    const group = screen.getByRole("radiogroup", { name: "Status izin" });
    expect(ref.current).toBe(group);
    expect(group).toHaveAttribute("id", "status");
    expect(group).toHaveAccessibleDescription("Pilih status yang ditampilkan");
  });

  it("names a segment by its ariaLabel so a count is read with its meaning", () => {
    render(
      <SegmentedControl
        aria-label="Komponen"
        options={[
          { value: "tg1", label: "TG1", count: 2, ariaLabel: "TG1, 2 kosong" },
          { value: "uh1", label: "UH1" },
        ]}
        defaultValue="tg1"
      />,
    );
    expect(screen.getByRole("radio", { name: "TG1, 2 kosong" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "UH1" })).not.toBeChecked();
  });

  it("trims the side padding in the dense size and keeps the touch height", () => {
    const days = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((label, index) => ({
      value: String(index + 1),
      label,
    }));
    const { rerender } = render(
      <SegmentedControl aria-label="Hari" options={days} defaultValue="1" fullWidth />,
    );
    expect(screen.getByRole("radio", { name: "Sen" })).toHaveClass("px-4");
    rerender(
      <SegmentedControl aria-label="Hari" options={days} defaultValue="1" fullWidth size="dense" />,
    );
    const monday = screen.getByRole("radio", { name: "Sen" });
    expect(monday).toHaveClass("px-1.5", "gap-1", "h-8", "pointer-coarse:h-9");
    expect(monday).not.toHaveClass("px-4");
  });

  it("stretches on a phone only when fullWidth is phone", () => {
    const { container, rerender } = render(
      <SegmentedControl aria-label="Status izin" options={options} defaultValue="all" />,
    );
    const track = (): Element | null => container.firstElementChild;
    expect(track()).toHaveClass("inline-flex", "w-fit");
    // The segments fill whatever width the track gets, so a FilterBar that
    // stretches the track while it stacks stretches the segments with it.
    expect(screen.getByRole("radiogroup")).toHaveClass("flex-1");
    expect(screen.getByRole("radiogroup").parentElement).toBe(track());
    rerender(
      <SegmentedControl aria-label="Status izin" options={options} defaultValue="all" fullWidth />,
    );
    expect(track()).toHaveClass("flex", "w-full");
    expect(track()).not.toHaveClass("sm:w-fit");
    rerender(
      <SegmentedControl
        aria-label="Status izin"
        options={options}
        defaultValue="all"
        fullWidth="phone"
      />,
    );
    expect(track()).toHaveClass("flex", "w-full", "sm:inline-flex", "sm:w-fit");
    expect(screen.getByRole("radiogroup")).toHaveClass("flex-1");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <SegmentedControl aria-label="Status izin" options={options} defaultValue="pending" />,
    );
    await expectNoAxeViolations(container);
  });
});
