import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs.js";

const LABELS = ["Ringkasan", "Kehadiran", "Nilai", "Pelanggaran", "Prestasi", "Dokumen"];

function ManyTabs() {
  return (
    <Tabs defaultValue="Ringkasan">
      <TabsList aria-label="Bagian profil">
        {LABELS.map((label) => (
          <TabsTrigger key={label} value={label}>
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
    // the list is capped at its container and scrolls, and no tab shrinks
    // or wraps to make room.
    expect(list).toHaveClass("max-w-full", "overflow-x-auto");
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
});
