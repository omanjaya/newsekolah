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

/** The pill around a label (the label itself sits in its own truncating span). */
function pill(label: string): HTMLElement | null {
  return screen.getByText(label).closest('[data-slot="badge"]');
}

describe("SemanticStatusBadge", () => {
  it("renders a pill in the semantic tone, with a dot and its label", async () => {
    const { container } = render(<SemanticStatusBadge status="approved" label="Disetujui" />);
    const badge = pill("Disetujui");
    expect(badge).toHaveClass("rounded-full", "bg-success-soft", "text-success-soft-fg");
    expect(badge).toHaveAttribute("data-status", "approved");
    expect(badge?.querySelector('[aria-hidden="true"]')).toHaveClass("bg-success");
    await expectNoAxeViolations(container);
  });

  it("renders the same pill shape, neutral, for quiet states", () => {
    render(<SemanticStatusBadge status="cancelled" label="Dibatalkan" />);
    expect(pill("Dibatalkan")).toHaveClass(
      "rounded-full",
      "bg-neutral-soft",
      "text-neutral-soft-fg",
    );
  });
});

describe("StatusBadge", () => {
  it("renders an attendance status as a neutral pill with its token dot and default name", async () => {
    const { container } = render(<StatusBadge status="sick" />);
    const badge = pill("Sakit");
    expect(badge).toHaveClass("rounded-full", "bg-neutral-soft", "text-fg");
    expect(badge?.querySelector('[aria-hidden="true"]')).toHaveClass("bg-status-sick");
    await expectNoAxeViolations(container);
  });

  // An Alfa or a Terlambat has to stand out of a roster of Hadir; the
  // excused statuses stay neutral so the two oranges (sick, late) never
  // sit side by side as fills.
  it("tints absent and late in the semantic soft fills and keeps the rest neutral", async () => {
    const { container } = render(
      <>
        <StatusBadge status="present" />
        <StatusBadge status="sick" />
        <StatusBadge status="excused" />
        <StatusBadge status="dispensation" />
        <StatusBadge status="absent" />
        <StatusBadge status="late" />
      </>,
    );
    for (const label of ["Hadir", "Sakit", "Izin", "Dispensasi"]) {
      expect(pill(label)).toHaveClass("bg-neutral-soft", "text-fg");
    }
    const absent = pill("Alfa");
    expect(absent).toHaveClass("bg-danger-soft", "text-danger-soft-fg");
    expect(absent).not.toHaveClass("text-fg");
    expect(absent?.querySelector('[aria-hidden="true"]')).toHaveClass("bg-status-absent");
    const late = pill("Terlambat");
    expect(late).toHaveClass("bg-warning-soft", "text-warning-soft-fg");
    expect(late?.querySelector('[aria-hidden="true"]')).toHaveClass("bg-status-late");
    await expectNoAxeViolations(container);
  });

  it("takes a localized label, and tints the outline of an exception too", () => {
    render(
      <>
        <StatusBadge status="present" label="Present" appearance="outline" />
        <StatusBadge status="absent" label="Absent" appearance="outline" />
      </>,
    );
    expect(pill("Present")).toHaveClass("ring-1", "text-fg");
    expect(pill("Absent")).toHaveClass("ring-1", "ring-danger", "text-danger");
  });
});
