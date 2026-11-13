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
    expect(screen.getByRole("heading", { name: "Matematika · X-A" })).toHaveClass("text-display");
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

  it("follows the artboard: radius 24, a sentence-case 13/600 eyebrow, muted meta", () => {
    const { container } = render(
      <HeroCard eyebrow="Pelajaran berikutnya" title="Matematika" meta="Ruang X-A" />,
    );
    expect(container.firstElementChild).toHaveClass("rounded-xl", "bg-accent-soft", "py-4.5");
    const eyebrow = screen.getByText("Pelajaran berikutnya");
    expect(eyebrow).toHaveClass("text-label");
    expect(eyebrow).not.toHaveClass("uppercase");
    expect(screen.getByText("Ruang X-A")).toHaveClass("text-accent-soft-fg/80");
  });

  it("offers a neutral and a warning tone, and a live chip", () => {
    const { container, rerender } = render(
      <HeroCard tone="neutral" title="Tidak ada jadwal lagi" chip="Selesai" />,
    );
    expect(container.firstElementChild).toHaveClass("bg-surface", "border-border");
    rerender(<HeroCard tone="warning" title="3 jurnal belum diisi" chip="Lewat 2 hari" live />);
    expect(container.firstElementChild).toHaveClass("bg-warning-soft");
    expect(screen.getByText("Lewat 2 hari").querySelector(".animate-live")).toBeInTheDocument();
  });
});
