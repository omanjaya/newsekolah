import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { HeroCard } from "./hero-card.js";

describe("HeroCard", () => {
  it("renders eyebrow, title as a heading, meta, chip and action", async () => {
    const { container } = render(
      <HeroCard
        eyebrow="Sekarang"
        title="Matematika · X-A"
        meta="08.40-10.00"
        chip="12 menit lagi"
        action={<a href="/attendance">Isi presensi</a>}
      />,
    );
    expect(screen.getByRole("heading", { name: "Matematika · X-A" })).toBeInTheDocument();
    expect(screen.getByText("Sekarang")).toBeInTheDocument();
    expect(screen.getByText("08.40-10.00")).toBeInTheDocument();
    expect(screen.getByText("12 menit lagi")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Isi presensi" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("omits optional parts", () => {
    render(<HeroCard eyebrow="Hari ini" title="Tidak ada jadwal" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
