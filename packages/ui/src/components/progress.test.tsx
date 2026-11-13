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

  it("has no accessibility violations", async () => {
    const { container } = render(
      <div>
        <Progress value={40} label="Mengunggah" />
        <Progress variant="meter" value={96} label="Kehadiran" tone="success" />
      </div>,
    );
    await expectNoAxeViolations(container);
  });
});
