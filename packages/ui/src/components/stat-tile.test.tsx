import { render, screen } from "@testing-library/react";
import { CalendarCheck } from "lucide-react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { StatTile } from "./stat-tile.js";

describe("StatTile", () => {
  it("shows value, label and hint, icon hidden from assistive tech", async () => {
    const { container } = render(
      <StatTile icon={CalendarCheck} tone="green" value="96%" label="Kehadiran" hint="bulan ini" />,
    );
    expect(screen.getByText("96%")).toBeInTheDocument();
    expect(screen.getByText("Kehadiran")).toBeInTheDocument();
    expect(screen.getByText("bulan ini")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    await expectNoAxeViolations(container);
  });
});
