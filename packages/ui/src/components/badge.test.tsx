import { render, screen } from "@testing-library/react";
import { X } from "lucide-react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Badge } from "./badge.js";
import { CountBadge } from "./count-badge.js";
import { IconButton } from "./icon-button.js";

/** The pill around a label (the label itself sits in its own truncating span). */
function pill(label: string): HTMLElement | null {
  return screen.getByText(label).closest('[data-slot="badge"]');
}

describe("Badge", () => {
  it("renders a soft neutral pill by default", async () => {
    const { container } = render(<Badge>Draf</Badge>);
    expect(pill("Draf")).toHaveClass("rounded-full", "min-h-6", "text-caption", "bg-state-pressed");
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
    expect(pill("Disetujui")).toHaveClass("bg-success-soft", "text-success-soft-fg");
    expect(pill("Baru")).toHaveClass("bg-accent", "text-accent-fg");
    expect(pill("Nilai")).toHaveClass("ring-1", "ring-inset", "text-category-purple", "min-h-5");
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
    expect(pill("Utama")).toHaveClass("bg-accent-soft");
    expect(pill("Ditolak")).toHaveClass("bg-danger-soft");
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

  // The pill is capped at its container (`max-w-full`); a label only
  // shrinks to an ellipsis inside it when it is a box of its own.
  it("puts each run of text in a span that can truncate", () => {
    const count = 3;
    render(
      <Badge dot>
        {count} siswa <strong>baru</strong>
      </Badge>,
    );
    const label = screen.getByText("3 siswa");
    expect(label.tagName).toBe("SPAN");
    expect(label).toHaveClass("min-w-0", "truncate");
    expect(label.parentElement).toHaveAttribute("data-slot", "badge");
    expect(screen.getByText("baru").tagName).toBe("STRONG");
  });

  // A pill around a control (a removable recipient) grows to hold it
  // instead of letting the button spill above and below a fixed height.
  it("is a minimum height, so a control inside does not overflow it", () => {
    render(
      <Badge>
        kepala.sekolah@sman1.sch.id
        <IconButton size="sm" icon={<X />} aria-label="Hapus" tooltip={false} />
      </Badge>,
    );
    const badge = pill("kepala.sekolah@sman1.sch.id");
    expect(badge).toHaveClass("min-h-6");
    expect(badge).not.toHaveClass("h-6");
    expect(badge).toContainElement(screen.getByRole("button", { name: "Hapus" }));
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
