import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
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

  it("retries a failing renewal on a capped backoff instead of a tight loop", () => {
    const onRenew = vi.fn();
    // A renewal that goes in flight and fails 5ms later, leaving the code expired.
    function FailingKiosk() {
      const [renewing, setRenewing] = useState(false);
      return (
        <QrPanel
          payload="sion:visit:abc"
          code=""
          expiresAt={inSeconds(2)}
          renewing={renewing}
          onRenew={() => {
            onRenew();
            setRenewing(true);
            setTimeout(() => {
              setRenewing(false);
            }, 5);
          }}
          autoRenew
        />
      );
    }
    render(<FailingKiosk />);
    // In 100ms steps, so React renders between timers as it would in real time.
    const advance = (ms: number) => {
      for (let elapsed = 0; elapsed < ms; elapsed += 100) {
        act(() => {
          vi.advanceTimersByTime(Math.min(100, ms - elapsed));
        });
      }
    };
    advance(3000);
    expect(onRenew).toHaveBeenCalledTimes(1);
    advance(300);
    expect(onRenew).toHaveBeenCalledTimes(1);
    advance(5000);
    expect(onRenew).toHaveBeenCalledTimes(2);
    advance(15_000);
    expect(onRenew).toHaveBeenCalledTimes(3);
    advance(60_000);
    expect(onRenew).toHaveBeenCalledTimes(4);
    // Then it stops and leaves the button to a person.
    advance(10 * 60_000);
    expect(onRenew).toHaveBeenCalledTimes(4);
    expect(screen.getByRole("button", { name: "Buat kode baru" })).toHaveClass("bg-accent");
  });

  it("backs off when renewals keep returning a code that is already expired", () => {
    const onRenew = vi.fn();
    // The client clock is ahead of the server: every new code is born expired.
    function SkewedKiosk() {
      const [issued, setIssued] = useState(0);
      return (
        <QrPanel
          payload={`sion:visit:${issued}`}
          code=""
          expiresAt={new Date(NOW - 60_000 + issued).toISOString()}
          renewing={false}
          onRenew={() => {
            onRenew();
            setIssued((count) => count + 1);
          }}
          autoRenew
        />
      );
    }
    render(<SkewedKiosk />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onRenew).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onRenew).toHaveBeenCalledTimes(2);
  });

  it("starts the backoff afresh once a renewal brings a live code", () => {
    const onRenew = vi.fn();
    function HealthyKiosk() {
      const [expiresAt, setExpiresAt] = useState(inSeconds(2));
      return (
        <QrPanel
          payload="sion:visit:abc"
          code=""
          expiresAt={expiresAt}
          renewing={false}
          onRenew={() => {
            onRenew();
            setExpiresAt(new Date(Date.now() + 2000).toISOString());
          }}
          autoRenew
        />
      );
    }
    render(<HealthyKiosk />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onRenew).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    // The second code ran out too, and was renewed at once, not after 5s.
    expect(onRenew).toHaveBeenCalledTimes(2);
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

  it("reads a long-lived code as the time it stops working, not a seconds count", () => {
    const { container } = render(
      <QrPanel
        payload="sion:gate:abc"
        code=""
        expiresAt={inSeconds(8 * 3600)}
        onRenew={vi.fn()}
        renewing={false}
        expiryDisplay="until"
        validUntilLabel={(expiresAt) => `Berlaku sampai ${expiresAt}`}
      />,
    );
    expect(screen.getByText(`Berlaku sampai ${inSeconds(8 * 3600)}`)).toBeInTheDocument();
    expect(screen.queryByText(/detik/)).not.toBeInTheDocument();
    // No ring, and no "new code" while the code still works.
    expect(container.querySelector("circle")).toBeNull();
    expect(screen.queryByRole("button", { name: "Buat kode baru" })).not.toBeInTheDocument();
  });

  it("formats a long-lived code's expiry with the locale by default, and offers a new code once it runs out", () => {
    render(
      <QrPanel
        payload="sion:gate:abc"
        code=""
        expiresAt={inSeconds(180)}
        onRenew={vi.fn()}
        renewing={false}
        expiryDisplay="until"
      />,
    );
    expect(screen.getByText(/^Berlaku sampai pukul \d{2}\.\d{2}$/)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(182 * 1000);
    });
    expect(screen.getAllByText("Kode kedaluwarsa").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Buat kode baru" })).toBeInTheDocument();
  });

  it("keeps the seconds countdown by default, even when the device clock runs behind the server", () => {
    // A 30-second code read on a clock 10 minutes slow looks 630 seconds
    // long; it is still a countdown with a way to a new code.
    render(
      <QrPanel
        payload="sion:desk:abc"
        code=""
        expiresAt={inSeconds(630)}
        onRenew={vi.fn()}
        renewing={false}
      />,
    );
    expect(screen.getByText("Berlaku 630 detik lagi")).toBeInTheDocument();
    expect(screen.queryByText(/Berlaku sampai/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buat kode baru" })).toBeInTheDocument();
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
