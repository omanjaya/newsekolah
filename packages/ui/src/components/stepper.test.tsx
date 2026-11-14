import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Stepper } from "./stepper.js";
import { UiLabelsProvider } from "./ui-labels.js";

const WORKFLOW = [
  { id: "submitted", label: "Diajukan", actor: "Nadia Putri", time: "25 Sep 08.02" },
  { id: "homeroom", label: "Wali kelas", actor: "Disetujui Bu Rina", time: "08.14" },
  { id: "duty", label: "Guru piket", actor: "Menunggu guru piket" },
  { id: "gate", label: "Gerbang", description: "Tunjukkan QR ke satpam" },
];

describe("Stepper", () => {
  it("keeps following stages upcoming when a stage stops the workflow", () => {
    render(
      <Stepper
        currentIndex={1}
        steps={[
          { id: "submitted", label: "Submitted", state: "complete" },
          { id: "review", label: "Review", state: "stopped" },
          { id: "issued", label: "Issued", state: "upcoming" },
        ]}
      />,
    );

    const review = screen.getByText("Review").closest("li");
    expect(review).toHaveTextContent("Review, dihentikan");
    expect(review?.querySelector(".bg-danger-soft")).toBeInTheDocument();
    expect(screen.getByText("Issued")).toHaveClass("text-fg-muted");
  });

  it("outlines upcoming steps and their connectors strongly enough for the dark theme", () => {
    render(<Stepper currentIndex={2} steps={WORKFLOW} />);
    const gate = screen.getByText("Gerbang").closest("li");
    const marker = gate?.querySelector("[aria-hidden=true].rounded-full");
    expect(marker).toHaveClass("bg-surface-raised", "border", "border-border-strong/60");
    expect(marker).not.toHaveClass("bg-surface-sunken");
    // The line into an upcoming step, and the line between two done ones.
    expect(gate?.querySelector(".bg-border-strong\\/40")).toBeInTheDocument();
    const homeroom = screen.getByText("Wali kelas").closest("li");
    expect(homeroom?.querySelector(".h-0\\.5.bg-accent")).toBeInTheDocument();
    expect(document.querySelector(".bg-line")).toBeNull();
  });

  it("says who acted and when on each step", () => {
    render(<Stepper steps={WORKFLOW} currentIndex={2} />);
    const homeroom = screen.getByText("Wali kelas").closest("li");
    expect(homeroom).toHaveTextContent("Disetujui Bu Rina");
    expect(homeroom).toHaveTextContent("08.14");
  });

  it("keeps actor and time apart for a screen reader, which skips the dot", () => {
    render(<Stepper steps={WORKFLOW} currentIndex={2} />);
    const homeroom = screen.getByText("Wali kelas").closest("li");
    const spoken = homeroom?.cloneNode(true) as HTMLElement;
    for (const hidden of Array.from(spoken.querySelectorAll("[aria-hidden='true']"))) {
      hidden.remove();
    }
    expect(spoken.textContent).toMatch(/Disetujui Bu Rina\s+08\.14/);
  });

  it("marks the current step and tells screen readers which steps are done", () => {
    render(
      <UiLabelsProvider labels={{ stepperStepComplete: "done" }}>
        <Stepper steps={WORKFLOW} currentIndex={2} />
      </UiLabelsProvider>,
    );
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items[2]).toHaveAttribute("aria-current", "step");
    expect(items[0]).toHaveTextContent("Diajukan, done");
    expect(items[3]).not.toHaveTextContent("done");
  });

  it("is a row from 640px up and a list on a phone, unless vertical is asked for", () => {
    const { rerender } = render(<Stepper steps={WORKFLOW} currentIndex={1} />);
    expect(screen.getByRole("list")).toHaveClass("flex-col", "sm:flex-row");
    rerender(<Stepper steps={WORKFLOW} currentIndex={1} orientation="vertical" />);
    expect(screen.getByRole("list")).toHaveClass("flex-col");
    expect(screen.getByRole("list")).not.toHaveClass("sm:flex-row");
  });

  it("leaves descriptions, actors and times out of the compact variant, which stays a row", () => {
    render(<Stepper steps={WORKFLOW} currentIndex={1} variant="compact" />);
    expect(screen.getByRole("list")).toHaveClass("flex-row");
    expect(screen.queryByText("Disetujui Bu Rina")).not.toBeInTheDocument();
    expect(screen.queryByText("Tunjukkan QR ke satpam")).not.toBeInTheDocument();
    expect(screen.getByText("Gerbang")).toHaveClass("text-caption");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<Stepper steps={WORKFLOW} currentIndex={2} />);
    await expectNoAxeViolations(container);
  });
});
