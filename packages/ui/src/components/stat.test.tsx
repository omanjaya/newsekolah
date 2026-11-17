import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarCheck } from "lucide-react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Stat, StatGrid } from "./stat.js";
import { UiLabelsProvider } from "./ui-labels.js";

describe("Stat in a StatGrid", () => {
  it("is one div holding exactly a dt and its dds, the only grouping a dl allows", async () => {
    const { container } = render(
      <StatGrid variant="tiles">
        <Stat icon={<CalendarCheck />} value="96%" label="Kehadiran" hint="bulan ini" />
        <Stat value={3} label="Nilai baru" />
      </StatGrid>,
    );
    const list = container.querySelector("dl");
    expect(list).not.toBeNull();
    for (const group of Array.from(list?.children ?? [])) {
      expect(group.tagName).toBe("DIV");
      const tags = Array.from(group.children).map((child) => child.tagName);
      expect(tags[0]).toBe("DT");
      expect(tags.slice(1).every((tag) => tag === "DD")).toBe(true);
    }
    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual([
      "Kehadiran",
      "Nilai baru",
    ]);
    await expectNoAxeViolations(container);
  });

  it("takes the tile look from a tiles grid and the compact look from a strip", () => {
    const { container, rerender } = render(
      <StatGrid variant="tiles">
        <Stat value={1} label="Izin" />
      </StatGrid>,
    );
    expect(container.querySelector("dl > div")).toHaveClass("rounded-lg", "min-h-26", "p-4");
    rerender(
      <StatGrid variant="strip">
        <Stat value={1} label="Izin" />
      </StatGrid>,
    );
    expect(container.querySelector("dl")).toHaveClass("sm:divide-x");
    expect(container.querySelector("dl > div")).toHaveClass("min-w-36", "flex-[1_0_auto]");
  });
});

describe("Stat", () => {
  it("is plain text outside a StatGrid", async () => {
    const { container } = render(<Stat value="42 menit" label="Rata-rata" />);
    expect(container.querySelector("dt, dd")).toBeNull();
    expect(screen.getByText("42 menit")).toHaveClass("text-title-lg");
    await expectNoAxeViolations(container);
  });

  it("makes the whole stat a link named by its label and described by its value", async () => {
    const { container } = render(
      <StatGrid variant="tiles">
        <Stat value="96%" label="Kehadiran" hint="bulan ini" href="/attendance" />
      </StatGrid>,
    );
    const link = screen.getByRole("link", { name: "Kehadiran" });
    expect(link).toHaveAttribute("href", "/attendance");
    expect(link).toHaveAccessibleDescription(/96%.*bulan ini/);
    expect(container.querySelector("dl > div")).toHaveClass("motion-press", "hover:shadow-2");
    await expectNoAxeViolations(container);
  });

  it("runs onClick from a stretched button", async () => {
    const onClick = vi.fn();
    render(<Stat value={6} label="Di bawah KKM" onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "Di bawah KKM" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("counts a number up once, tabular while it moves, formatted with the UiLabels locale", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    try {
      render(
        <UiLabelsProvider labels={{ locale: "id-ID" }}>
          <Stat value={1284} label="Total" countUp />
        </UiLabelsProvider>,
      );
      expect(screen.getByText("0")).toHaveClass("tabular-nums");
      act(() => {
        vi.advanceTimersByTime(600);
      });
      const settled = screen.getByText("1.284");
      expect(settled).not.toHaveClass("tabular-nums");
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("uses a custom format and a delta with a spoken direction", () => {
    render(
      <UiLabelsProvider labels={{ statDeltaUp: "Up" }}>
        <Stat
          value={0.82}
          formatValue={(n) => `${String(Math.round(n * 100))}%`}
          label="Tuntas"
          delta={{ value: "+4%", direction: "up" }}
        />
      </UiLabelsProvider>,
    );
    expect(screen.getByText("82%")).toBeInTheDocument();
    const delta = screen.getByText("+4%", { exact: false });
    expect(delta).toHaveClass("text-success");
    expect(within(delta).getByText("Up", { exact: false })).toHaveClass("sr-only");
  });

  it("holds the value's place with a skeleton while loading", () => {
    const { container } = render(<Stat value={0} label="Kehadiran" loading />);
    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  // The whole stat is the target through the label's stretched ::after. The
  // chevron and a strip cell's icon are positioned, so they paint above
  // that layer; they must let the pointer through or they are dead spots.
  it("lets clicks on the tile chevron and the strip icon fall through to the target", () => {
    const { container, rerender } = render(
      <StatGrid variant="tiles">
        <Stat icon={<CalendarCheck />} value="96%" label="Kehadiran" href="/attendance" />
      </StatGrid>,
    );
    expect(container.querySelector("svg.lucide-chevron-right")).toHaveClass(
      "pointer-events-none",
      "absolute",
    );
    rerender(
      <StatGrid variant="strip">
        <Stat icon={<CalendarCheck />} value="96%" label="Kehadiran" onClick={() => undefined} />
      </StatGrid>,
    );
    const icon = container.querySelector("svg.lucide-calendar-check")?.parentElement;
    expect(icon).toHaveClass("pointer-events-none", "absolute");
  });

  it("formats every number with the UiLabels locale, counting or not", () => {
    render(
      <UiLabelsProvider labels={{ locale: "id-ID" }}>
        <Stat value={1284} label="Total" />
        <Stat value="1284" label="Kode" />
      </UiLabelsProvider>,
    );
    expect(screen.getByText("1.284")).toBeInTheDocument();
    // A string is shown as given.
    expect(screen.getByText("1284")).toBeInTheDocument();
  });

  it("renders no footer for an empty hint", () => {
    const { container } = render(
      <StatGrid>
        <Stat value={3} label="Izin" hint="" />
        <Stat value={4} label="Sakit" hint={null} />
        <Stat value={5} label="Alfa" hint={false} />
      </StatGrid>,
    );
    for (const group of Array.from(container.querySelectorAll("dl > div"))) {
      expect(group.querySelectorAll("dd")).toHaveLength(1);
    }
    expect(screen.getAllByRole("definition")).toHaveLength(3);
  });

  // The hint is smaller than the label, so it must not read heavier: the
  // caption role's 500 drops to 400, and only the change keeps 600.
  it("keeps the hint no heavier than the label, the change semibold", () => {
    render(
      <Stat
        value="96%"
        label="Kehadiran"
        hint="bulan ini"
        delta={{ value: "+2%", direction: "up" }}
      />,
    );
    expect(screen.getByText("Kehadiran")).toHaveClass("text-body-sm", "text-fg-muted");
    const footer = screen.getByText("bulan ini");
    expect(footer).toHaveClass("text-caption", "font-normal", "text-fg-muted");
    expect(screen.getByText("+2%")).toHaveClass("font-semibold");
  });

  it("takes `tone` as the name of the icon colour, `category` still honoured", () => {
    const { container } = render(
      <>
        <Stat icon={<CalendarCheck />} tone="purple" value={1} label="A" />
        <Stat icon={<CalendarCheck />} category="amber" value={2} label="B" />
        <Stat icon={<CalendarCheck />} tone="blue" category="red" value={3} label="C" />
      </>,
    );
    const circles = Array.from(container.querySelectorAll("svg.lucide-calendar-check")).map(
      (svg) => svg.parentElement,
    );
    expect(circles[0]).toHaveClass("bg-category-purple-soft");
    expect(circles[1]).toHaveClass("bg-category-amber-soft");
    expect(circles[2]).toHaveClass("bg-category-blue-soft");
  });

  it("runs onClick and follows href when a stat has both", async () => {
    const onClick = vi.fn();
    render(<Stat value={3} label="Izin" href="#permits" onClick={onClick} />);
    await userEvent.click(screen.getByRole("link", { name: "Izin" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe("#permits");
  });

  it("says which filter tile is on with aria-pressed and the selected ring", async () => {
    const onClick = vi.fn();
    const { container } = render(
      <StatGrid variant="tiles" aria-label="Tingkat risiko">
        <Stat value={2} label="Berisiko" onClick={onClick} selected />
        <Stat value={5} label="Dipantau" onClick={onClick} selected={false} />
        <Stat value={9} label="Aman" onClick={onClick} />
      </StatGrid>,
    );
    const on = screen.getByRole("button", { name: "Berisiko" });
    const off = screen.getByRole("button", { name: "Dipantau" });
    expect(on).toHaveAttribute("aria-pressed", "true");
    expect(off).toHaveAttribute("aria-pressed", "false");
    // A stat that is not a toggle is not announced as one.
    expect(screen.getByRole("button", { name: "Aman" })).not.toHaveAttribute("aria-pressed");
    // A filter tile opens nothing, so it draws no "go to" chevron.
    expect(container.querySelector("svg.lucide-chevron-right")).toBeNull();
    const [first, second] = Array.from(container.querySelectorAll("dl > div"));
    expect(first).toHaveClass("border-accent", "ring-1", "ring-accent");
    expect(first).toHaveAttribute("data-selected");
    expect(second).not.toHaveClass("ring-accent");
    await userEvent.click(on);
    expect(onClick).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });

  it("marks a selected link stat as current and a strip cell with the selected layer", () => {
    render(
      <StatGrid variant="strip" aria-label="Status">
        <Stat value={3} label="Menunggu" href="#pending" selected />
      </StatGrid>,
    );
    const link = screen.getByRole("link", { name: "Menunggu" });
    expect(link).toHaveAttribute("aria-current", "true");
    expect(link.closest("[data-selected]")).toHaveClass("bg-state-selected");
  });

  it("puts an id, a test id and a ref on its root", () => {
    const ref = createRef<HTMLDivElement>();
    render(<Stat ref={ref} id="total" data-testid="total-stat" value={3} label="Izin" />);
    expect(screen.getByTestId("total-stat")).toBe(ref.current);
    expect(ref.current).toHaveAttribute("id", "total");
  });
});

describe("StatGrid strip", () => {
  it("names its scrolling group from its own aria-label and is not a tab stop when all fit", async () => {
    const { container } = render(
      <StatGrid variant="strip" aria-label="Ringkasan nilai">
        <Stat value={32} label="Siswa" />
        <Stat value={6} label="Di bawah KKM" />
      </StatGrid>,
    );
    const group = screen.getByRole("group", { name: "Ringkasan nilai" });
    // jsdom lays nothing out, so the figures fit and the strip is not focusable.
    expect(group).not.toHaveAttribute("tabindex");
    expect(group.querySelector("dl")).not.toHaveAttribute("aria-label");
    await expectNoAxeViolations(container);
  });

  // A phone showed the screen edge landing mid-word on the third or fourth
  // figure with nothing hinting at more. Up to four figures now sit two
  // to a row there, labels wrapping; a longer strip scrolls behind a fade.
  it("sets up to four figures two to a row on a phone, labels wrapping", () => {
    const { container } = render(
      <StatGrid variant="strip" aria-label="Opname">
        <Stat value={4} label="Diharapkan" />
        <Stat value={2} label="Terpindai" />
        <Stat value={1} label="Hilang" />
      </StatGrid>,
    );
    const list = container.querySelector("dl");
    expect(list).toHaveClass(
      "grid",
      "grid-cols-2",
      "sm:flex",
      "max-sm:[&>*:nth-child(even)]:border-l",
      "max-sm:[&>*:nth-child(n+3)]:border-t",
      "max-sm:[&>*:last-child:nth-child(odd)]:col-span-2",
    );
    expect(list).not.toHaveClass("divide-x");
    for (const cell of Array.from(container.querySelectorAll("dl > div"))) {
      expect(cell).toHaveClass("max-sm:min-w-0");
    }
    for (const term of screen.getAllByRole("term")) {
      expect(term).toHaveClass("sm:whitespace-nowrap");
      expect(term).not.toHaveClass("whitespace-nowrap");
    }
  });

  it("scrolls five figures or more in one row behind an edge fade, on its own surface", () => {
    const { container } = render(
      <StatGrid variant="strip" aria-label="Rekap">
        {["Hadir", "Sakit", "Izin", "Alfa", "Terlambat"].map((label, index) => (
          <Stat key={label} value={index} label={label} />
        ))}
      </StatGrid>,
    );
    const group = screen.getByRole("group", { name: "Rekap" });
    expect(group).toHaveClass("overflow-x-auto", "scroll-fade-x", "snap-x");
    // The border and corners sit on a box of their own, out of the fade's reach.
    expect(group).not.toHaveClass("border");
    expect(group.parentElement).toHaveClass("overflow-hidden", "rounded-lg", "border");
    expect(container.querySelector("dl")).toHaveClass("flex", "w-max", "divide-x");
    expect(container.querySelector("dl")).not.toHaveClass("grid-cols-2");
    for (const term of screen.getAllByRole("term")) {
      expect(term).toHaveClass("whitespace-nowrap");
    }
  });

  it("becomes a tab stop while figures sit past its edge", () => {
    const scrollWidth = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(600);
    const clientWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(358);
    try {
      render(
        <StatGrid variant="strip" aria-label="Ringkasan">
          <Stat value={32} label="Siswa" />
        </StatGrid>,
      );
      expect(screen.getByRole("group", { name: "Ringkasan" })).toHaveAttribute("tabindex", "0");
    } finally {
      scrollWidth.mockRestore();
      clientWidth.mockRestore();
    }
  });
});
