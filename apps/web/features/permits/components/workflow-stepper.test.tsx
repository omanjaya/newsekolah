import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowMineStageTrack } from "./workflow-stepper";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("WorkflowMineStageTrack", () => {
  it("renders the four nodes: submitted, homeroom, counselor, done", () => {
    render(<WorkflowMineStageTrack status="in_progress" currentStageIndex={0} />);
    expect(screen.getByTestId("mine-stage-track-node-submitted")).toBeInTheDocument();
    expect(screen.getByTestId("mine-stage-track-node-homeroom")).toBeInTheDocument();
    expect(screen.getByTestId("mine-stage-track-node-counselor")).toBeInTheDocument();
    expect(screen.getByTestId("mine-stage-track-node-done")).toBeInTheDocument();
  });

  it("marks the current stage for an in-progress request at stage 0", () => {
    render(<WorkflowMineStageTrack status="in_progress" currentStageIndex={0} />);
    expect(screen.getByTestId("mine-stage-track-node-homeroom")).toHaveAttribute(
      "data-state",
      "current",
    );
    expect(screen.getByTestId("mine-stage-track-node-counselor")).toHaveAttribute(
      "data-state",
      "upcoming",
    );
  });

  it("marks every stage complete once approved, but done stays upcoming", () => {
    render(<WorkflowMineStageTrack status="approved" currentStageIndex={1} />);
    expect(screen.getByTestId("mine-stage-track-node-homeroom")).toHaveAttribute(
      "data-state",
      "complete",
    );
    expect(screen.getByTestId("mine-stage-track-node-counselor")).toHaveAttribute(
      "data-state",
      "complete",
    );
    expect(screen.getByTestId("mine-stage-track-node-done")).toHaveAttribute(
      "data-state",
      "upcoming",
    );
  });

  it("marks everything complete, including done, once completed", () => {
    render(<WorkflowMineStageTrack status="completed" currentStageIndex={1} />);
    for (const id of ["submitted", "homeroom", "counselor", "done"]) {
      expect(screen.getByTestId(`mine-stage-track-node-${id}`)).toHaveAttribute(
        "data-state",
        "complete",
      );
    }
  });

  it("stops the current stage when the request is rejected", () => {
    render(<WorkflowMineStageTrack status="rejected" currentStageIndex={0} />);
    expect(screen.getByTestId("mine-stage-track-node-homeroom")).toHaveAttribute(
      "data-state",
      "stopped",
    );
    expect(screen.getByTestId("mine-stage-track-node-counselor")).toHaveAttribute(
      "data-state",
      "upcoming",
    );
  });
});
