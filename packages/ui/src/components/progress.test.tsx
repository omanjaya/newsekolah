import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Progress } from "./progress.js";

describe("Progress", () => {
  it("is a progressbar named by its label, clamped to its range", () => {
    render(<Progress value={140} label="Mengimpor siswa" />);
    const bar = screen.getByRole("progressbar", { name: "Mengimpor siswa" });
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("grows its fill in with a transform, from empty", async () => {
    render(<Progress value={64} aria-label="Unggah" />);
    const fill = screen.getByRole("progressbar", { name: "Unggah" }).firstElementChild;
    expect(fill).toHaveClass("motion-meter", "origin-left", "scale-x-(--progress)");
    await waitFor(() => {
      expect((fill as HTMLElement).style.getPropertyValue("--progress")).toBe("0.64");
    });
  });

  it("shows a meter with its label, value text and tone", () => {
    render(
      <Progress
        variant="meter"
        value={68}
        label="Matematika"
        valueLabel="68 / 100"
        tone="warning"
      />,
    );
    const meter = screen.getByRole("meter", { name: "Matematika" });
    expect(meter).toHaveAttribute("aria-valuetext", "68 / 100");
    expect(meter.firstElementChild).toHaveClass("bg-warning");
    expect(screen.getByText("68 / 100")).toBeInTheDocument();
  });

  it("reads a value against a max other than 100", () => {
    render(<Progress variant="meter" value={2} max={3} label="Buku dipinjam" />);
    const meter = screen.getByRole("meter", { name: "Buku dipinjam" });
    expect(meter).toHaveAttribute("aria-valuemax", "3");
    expect(meter).toHaveAttribute("aria-valuetext", "67%");
  });

  it("draws threshold markers on the scale, outside the meter's fill", () => {
    const { container } = render(
      <Progress
        variant="meter"
        value={60}
        label="KKTP 75"
        markers={[{ value: 75 }, { value: 50, label: "Remedial" }, { value: 120, label: "Batas" }]}
      />,
    );
    const meter = screen.getByRole("meter", { name: "KKTP 75" });
    // The fill stays the meter's only child; the lines sit beside it.
    expect(meter.children).toHaveLength(1);
    const lines = Array.from(
      container.querySelectorAll<HTMLElement>("[data-slot=progress-marker]"),
    );
    expect(lines.map((line) => line.style.getPropertyValue("--marker"))).toEqual([
      "0.75",
      "0.5",
      "1",
    ]);
    expect(lines[0]).toHaveAttribute("aria-hidden", "true");
    expect(lines[0]).toHaveClass("-translate-x-1/2", "bg-fg");
    // A marker past the end is held at the end, drawn inside the track.
    expect(lines[2]).toHaveClass("-translate-x-full");
    // Only named markers get a name under the line, centred or held in.
    expect(screen.getByText("Remedial")).toHaveClass("-translate-x-1/2", "text-caption");
    expect(screen.getByText("Batas")).toHaveClass("-translate-x-full");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <div>
        <Progress value={40} label="Mengunggah" />
        <Progress variant="meter" value={96} label="Kehadiran" tone="success" />
        <Progress value={30} aria-label="Poin" markers={[{ value: 25, label: "SP 1" }]} />
      </div>,
    );
    await expectNoAxeViolations(container);
  });
});
