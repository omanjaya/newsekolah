import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs.js";

const LABELS = ["Ringkasan", "Kehadiran", "Nilai", "Pelanggaran", "Prestasi", "Dokumen"];

function ManyTabs({ variant }: { variant?: "pill" | "underline" }) {
  return (
    <Tabs defaultValue="Ringkasan">
      <TabsList aria-label="Bagian profil" variant={variant}>
        {LABELS.map((label) => (
          <TabsTrigger key={label} value={label} count={label === "Pelanggaran" ? 2 : undefined}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {LABELS.map((label) => (
        <TabsContent key={label} value={label}>
          Isi {label}
        </TabsContent>
      ))}
    </Tabs>
  );
}

describe("Tabs", () => {
  it("switches panels with the arrow keys", async () => {
    render(<ManyTabs />);
    await userEvent.click(screen.getByRole("tab", { name: "Ringkasan" }));
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Kehadiran" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Isi Kehadiran");
  });

  it("scrolls inside its own track instead of widening the page on a phone", () => {
    render(<ManyTabs />);
    const list = screen.getByRole("tablist", { name: "Bagian profil" });
    // jsdom has no layout, so this checks the contract that makes it true:
    // the track is capped at its container, the row inside it scrolls with
    // edge fades, and no tab shrinks or wraps to make room.
    expect(list).toHaveClass("max-w-full", "min-w-0");
    const scroller = list.firstElementChild;
    expect(scroller).toHaveClass("overflow-x-auto", "scroll-fade-x", "flex-nowrap");
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveClass("shrink-0", "whitespace-nowrap");
    }
  });

  it("stays one row even when a caller asks the list to wrap", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Keuangan" className="flex-wrap">
          <TabsTrigger value="a">Loket</TabsTrigger>
          <TabsTrigger value="b">Tagihan</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const list = screen.getByRole("tablist", { name: "Keuangan" });
    expect(list).toHaveClass("flex-nowrap");
    expect(list).not.toHaveClass("flex-wrap");
  });

  it("reads a tab's count as part of its name", () => {
    render(<ManyTabs />);
    expect(screen.getByRole("tab", { name: "Pelanggaran 2" })).toBeInTheDocument();
  });

  it("has one decorative sliding indicator that stays out of the accessibility tree", () => {
    render(<ManyTabs />);
    const scroller = screen.getByRole("tablist").firstElementChild;
    const indicator = scroller?.firstElementChild;
    expect(indicator).toHaveAttribute("aria-hidden", "true");
    expect(indicator).toHaveClass("motion-indicator", "translate-x-(--indicator-x)");
  });

  it("draws the underline variant as a line with an accent bar", () => {
    render(<ManyTabs variant="underline" />);
    const list = screen.getByRole("tablist");
    expect(list).toHaveAttribute("data-variant", "underline");
    expect(list.firstElementChild?.firstElementChild).toHaveClass("bg-accent", "h-0.5");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<ManyTabs />);
    await expectNoAxeViolations(container);
  });
});
