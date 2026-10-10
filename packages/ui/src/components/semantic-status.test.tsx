import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  SEMANTIC_STATUS_TOKEN,
  SemanticStatusBadge,
  semanticStatusToken,
  type SemanticStatus,
} from "./semantic-status.js";

describe("semantic status mapping", () => {
  it("gives the same tone to states that mean the same thing", () => {
    expect(semanticStatusToken("approved")).toBe(semanticStatusToken("completed"));
    expect(semanticStatusToken("completed")).toBe(semanticStatusToken("published"));
    expect(semanticStatusToken("paid")).toBe("present");
    expect(semanticStatusToken("pending")).toBe("sick");
    expect(semanticStatusToken("rejected")).toBe("absent");
    expect(semanticStatusToken("overdue")).toBe("absent");
  });

  it("keeps quiet end states neutral", () => {
    const quiet: SemanticStatus[] = ["cancelled", "expired", "draft", "unpaid", "closed"];
    for (const status of quiet) expect(SEMANTIC_STATUS_TOKEN[status]).toBeNull();
  });

  it("never lets a refusal or a wait share a tone with an approval", () => {
    expect(semanticStatusToken("rejected")).not.toBe(semanticStatusToken("approved"));
    expect(semanticStatusToken("pending")).not.toBe(semanticStatusToken("approved"));
  });

  it("renders a coloured badge with its label", () => {
    render(<SemanticStatusBadge status="approved" label="Disetujui" />);
    expect(screen.getByText("Disetujui")).toHaveClass("text-status-present");
  });

  it("renders a neutral badge for quiet states", () => {
    render(<SemanticStatusBadge status="cancelled" label="Dibatalkan" />);
    expect(screen.getByText("Dibatalkan")).toHaveClass("text-fg-muted");
  });
});
