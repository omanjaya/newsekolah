import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Stepper } from "./stepper.js";

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

    expect(screen.getByText("Review").closest("li")).toHaveTextContent("Review");
    expect(document.querySelector(".text-status-absent")).toBeInTheDocument();
    expect(screen.getByText("Issued")).toHaveClass("text-fg-muted");
  });
});
