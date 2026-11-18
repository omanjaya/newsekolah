import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../messages/features";
import { getMessages } from "../lib/i18n/get-messages";

import { KioskShell } from "./kiosk-shell";

vi.mock("./tenant-brand", () => ({ TenantBrand: () => <span>SMA Contoh</span> }));

describe("KioskShell", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 07:42 in Jakarta (UTC+7).
    vi.setSystemTime(new Date("2026-11-14T00:42:10Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderShell() {
    return render(
      <NextIntlClientProvider locale="id" messages={getMessages("id") as never}>
        <KioskShell title="Monitor presensi" exitHref="/duty" timeZone="Asia/Jakarta">
          <p>Layar</p>
        </KioskShell>
      </NextIntlClientProvider>,
    );
  }

  it("frames the screen with the school, its name and the school's time", () => {
    renderShell();
    expect(screen.getByText("SMA Contoh")).toBeInTheDocument();
    expect(screen.getByText("Monitor presensi")).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Waktu sekolah" })).toHaveTextContent("07.42");
    expect(screen.getByRole("main")).toHaveTextContent("Layar");
  });

  it("sets the clock in the kiosk display role from sm up, large enough for a wall", () => {
    renderShell();
    const clock = screen.getByText("07.42");
    expect(clock.tagName).toBe("TIME");
    expect(clock).toHaveClass("sm:text-kiosk-display");
    // Tabular figures opened a gap after a "1" ("1 4.07").
    expect(clock).not.toHaveClass("tabular-nums");
  });

  // On a phone the header was a giant clock with the screen's name hidden.
  it("keeps the screen named on a phone, as a caption under the school", () => {
    renderShell();
    expect(screen.getByText("07.42")).toHaveClass("text-title-lg");
    const title = screen.getByText("Monitor presensi");
    expect(title).not.toHaveClass("hidden");
    expect(title).toHaveClass("text-caption", "sm:text-heading");
  });

  it("offers one quiet way back to where the kiosk was opened", () => {
    renderShell();
    expect(screen.getByRole("link", { name: "Keluar dari mode kios" })).toHaveAttribute(
      "href",
      "/duty",
    );
  });

  it("has no app navigation", () => {
    renderShell();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
