import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import {
  SEMANTIC_STATUS_TOKEN,
  SEMANTIC_STATUS_TONE,
  SemanticStatusBadge,
  semanticStatusToken,
  semanticStatusTone,
  type SemanticStatus,
} from "./semantic-status.js";
import { StatusBadge } from "./status-badge.js";

describe("semantic status mapping", () => {
  it("gives the same tone to states that mean the same thing", () => {
    expect(semanticStatusTone("approved")).toBe(semanticStatusTone("completed"));
    expect(semanticStatusTone("completed")).toBe(semanticStatusTone("published"));
    expect(semanticStatusTone("paid")).toBe("success");
    expect(semanticStatusTone("pending")).toBe("warning");
    expect(semanticStatusTone("in_progress")).toBe("info");
    expect(semanticStatusTone("rejected")).toBe("danger");
    expect(semanticStatusTone("overdue")).toBe("danger");
  });

  it("keeps quiet end states neutral", () => {
    const quiet: SemanticStatus[] = ["cancelled", "expired", "draft", "unpaid", "closed"];
    for (const status of quiet) {
      expect(SEMANTIC_STATUS_TONE[status]).toBe("neutral");
      expect(SEMANTIC_STATUS_TOKEN[status]).toBeNull();
    }
  });

  it("never lets a refusal or a wait share a tone with an approval", () => {
    expect(semanticStatusTone("rejected")).not.toBe(semanticStatusTone("approved"));
    expect(semanticStatusTone("pending")).not.toBe(semanticStatusTone("approved"));
  });

  it("keeps the legacy attendance-token mapping for existing callers", () => {
    expect(semanticStatusToken("paid")).toBe("present");
    expect(semanticStatusToken("partial")).toBe("late");
    expect(semanticStatusToken("overdue")).toBe("absent");
  });
});

describe("SemanticStatusBadge", () => {
  it("renders a pill in the semantic tone, with a dot and its label", async () => {
    const { container } = render(<SemanticStatusBadge status="approved" label="Disetujui" />);
    const badge = screen.getByText("Disetujui");
    expect(badge).toHaveClass("rounded-full", "bg-success-soft", "text-success-soft-fg");
    expect(badge).toHaveAttribute("data-status", "approved");
    expect(badge.querySelector('[aria-hidden="true"]')).toHaveClass("bg-success");
    await expectNoAxeViolations(container);
  });

  it("renders the same pill shape, neutral, for quiet states", () => {
    render(<SemanticStatusBadge status="cancelled" label="Dibatalkan" />);
    expect(screen.getByText("Dibatalkan")).toHaveClass("rounded-full", "text-fg-muted");
  });
});

describe("StatusBadge", () => {
  it("renders an attendance status as a pill with its token dot and default name", async () => {
    const { container } = render(<StatusBadge status="late" />);
    const badge = screen.getByText("Terlambat");
    expect(badge).toHaveClass("rounded-full", "text-fg");
    expect(badge.querySelector('[aria-hidden="true"]')).toHaveClass("bg-status-late");
    await expectNoAxeViolations(container);
  });

  it("takes a localized label", () => {
    render(<StatusBadge status="present" label="Present" appearance="outline" />);
    expect(screen.getByText("Present")).toHaveClass("ring-1");
  });
});
