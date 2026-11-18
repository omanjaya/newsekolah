import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionHeader } from "./section-header.js";

describe("SectionHeader", () => {
  it("sets a page section's title on the heading role by default", () => {
    render(<SectionHeader title="Hari ini" />);
    const heading = screen.getByRole("heading", { level: 2, name: "Hari ini" });
    expect(heading).toHaveClass("text-heading", "text-fg");
  });

  // Inside the picket queue card, "Terlambat" and "Izin keluar" were as
  // large as the card's own title above them.
  it("sets a group inside a card on the muted label role when small", () => {
    render(<SectionHeader as="h3" size="sm" title="Terlambat" count={2} />);
    const heading = screen.getByRole("heading", { level: 3, name: "Terlambat" });
    expect(heading).toHaveClass("text-label", "text-fg-muted");
    expect(heading).not.toHaveClass("text-heading");
  });
});
