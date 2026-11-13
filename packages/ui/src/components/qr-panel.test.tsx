import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { QrPanel, QrPanelSkeleton } from "./qr-panel.js";

const NOW = new Date("2026-11-14T08:00:00Z").getTime();

function inSeconds(seconds: number): string {
  return new Date(NOW + seconds * 1000).toISOString();
}

describe("QrPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("names the code for assistive tech and counts down", () => {
    render(
      <QrPanel
        payload="sion:class-entry:abc"
        code="K7F 2QD"
        expiresAt={inSeconds(30)}
        onRenew={vi.fn()}
        renewing={false}
        label="Kode QR masuk kelas"
      />,
    );
    expect(screen.getByRole("img", { name: "Kode QR masuk kelas" })).toBeInTheDocument();
    expect(screen.getByText("Berlaku 30 detik lagi")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("Berlaku 25 detik lagi")).toBeInTheDocument();
    expect(screen.getByText("K7F 2QD")).toHaveClass("tracking-widest");
  });

  it("asks for a new code by itself once the code runs out, with autoRenew", () => {
    const onRenew = vi.fn();
    render(
      <QrPanel
        payload="sion:visit:abc"
        code=""
        expiresAt={inSeconds(2)}
        onRenew={onRenew}
        renewing={false}
        autoRenew
      />,
    );
    expect(onRenew).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onRenew).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("Kode kedaluwarsa").length).toBeGreaterThan(0);
  });

  it("keeps waiting for a person without autoRenew, and makes renewing the primary action", () => {
    const onRenew = vi.fn();
    render(
      <QrPanel
        payload="sion:visit:abc"
        code="ABC"
        expiresAt={inSeconds(0)}
        onRenew={onRenew}
        renewing={false}
        renewLabel="Buat kode baru"
      />,
    );
    expect(onRenew).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Buat kode baru" })).toHaveClass("bg-accent");
  });

  it("holds the panel's shape while loading", () => {
    const { container } = render(<QrPanelSkeleton />);
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
  });

  it("has no accessibility violations", async () => {
    vi.useRealTimers();
    const { container } = render(
      <QrPanel
        payload="sion:class-entry:abc"
        code="K7F 2QD"
        expiresAt={new Date(Date.now() + 30_000).toISOString()}
        onRenew={vi.fn()}
        renewing={false}
      />,
    );
    await expectNoAxeViolations(container);
  });
});
