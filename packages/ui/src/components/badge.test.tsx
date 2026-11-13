import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Badge } from "./badge.js";
import { CountBadge } from "./count-badge.js";

describe("Badge", () => {
  it("renders a soft neutral pill by default", async () => {
    const { container } = render(<Badge>Draf</Badge>);
    const badge = screen.getByText("Draf");
    expect(badge).toHaveClass("rounded-full", "h-6", "text-caption", "bg-state-pressed");
    await expectNoAxeViolations(container);
  });

  it("maps tone and appearance to token classes", () => {
    render(
      <>
        <Badge tone="success">Disetujui</Badge>
        <Badge tone="accent" appearance="solid">
          Baru
        </Badge>
        <Badge tone="purple" appearance="outline" size="sm">
          Nilai
        </Badge>
      </>,
    );
    expect(screen.getByText("Disetujui")).toHaveClass("bg-success-soft", "text-success-soft-fg");
    expect(screen.getByText("Baru")).toHaveClass("bg-accent", "text-accent-fg");
    expect(screen.getByText("Nilai")).toHaveClass(
      "ring-1",
      "ring-inset",
      "text-category-purple",
      "h-5",
    );
  });

  it("still honours the legacy variant prop, with tone winning", () => {
    render(
      <>
        <Badge variant="accent">Utama</Badge>
        <Badge variant="neutral" tone="danger">
          Ditolak
        </Badge>
      </>,
    );
    expect(screen.getByText("Utama")).toHaveClass("bg-accent-soft");
    expect(screen.getByText("Ditolak")).toHaveClass("bg-danger-soft");
  });

  it("draws a decorative leading dot", () => {
    const { container } = render(
      <Badge tone="warning" dot>
        Menunggu
      </Badge>,
    );
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).toHaveClass("rounded-full", "bg-warning");
  });
});

describe("CountBadge", () => {
  it("caps the number and renders nothing for zero", () => {
    const { rerender, container } = render(<CountBadge count={140} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
    rerender(<CountBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<CountBadge count={0} showZero />);
    expect(screen.getByText("0")).toBeInTheDocument();
    rerender(<CountBadge count={1200} max={999} tone="danger" />);
    expect(screen.getByText("999+")).toHaveClass("bg-danger");
  });
});
