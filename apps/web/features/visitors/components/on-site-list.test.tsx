import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (values && "number" in values) return `${key} ${String(values.number)}`;
    if (values && "time" in values) return `${key} ${String(values.time)}`;
    return key;
  },
}));
vi.mock("../../../lib/simulation/clock", () => ({
  useBusinessNow: () => new Date("2026-11-19T03:00:00Z"),
}));
vi.mock("../../reference/directory-names", () => ({
  useDirectoryNames: () => new Map([["host-1", { name: "Kepala Sekolah Contoh" }]]),
}));

import type { BoardEntry } from "../api";

import { OnSiteList } from "./on-site-list";

const entry = {
  overdue: false,
  visit: {
    id: "v1",
    full_name: "Pak Joko",
    organization: null,
    purpose: "Rapat",
    host_user_id: null,
    arrived_at: "2026-11-19T02:00:00Z",
    badge_number: "12",
  },
} as unknown as BoardEntry;

const hosted: BoardEntry = { ...entry, visit: { ...entry.visit, host_user_id: "host-1" } };
const overdue: BoardEntry = { ...hosted, overdue: true };

function arrivalLine(): HTMLElement {
  const line = document.querySelector<HTMLElement>("[data-slot='on-site-arrival']");
  if (!line) throw new Error("no arrival line");
  return line;
}

function compactPass(): HTMLElement {
  const pass = document.querySelector<HTMLElement>("[data-slot='on-site-pass']");
  if (!pass) throw new Error("no pass line");
  return pass;
}

it("sizes the row to the list's own width, never the screen's", () => {
  // Beside the sidebar and the board's second column, a 768-1280px screen
  // left the list 430-590px wide, yet the screen-width rules gave it the
  // wide row: the trailing chip and the labelled check out squeezed the
  // text to 27px ("Rin...", "Me...", "Mas...").
  render(
    <OnSiteList entries={[overdue, entry]} canManage onCheckOut={vi.fn()} onPrintBadge={vi.fn()} />,
  );

  const list = screen.getByRole("list");
  expect(list.parentElement).toHaveClass("@container");
  // The buttons' own touch-target padding is the screen's business, not
  // the row's layout.
  const viewportVariant = /(^|:)(max-)?(sm|md|lg|xl|2xl):/;
  const classes = Array.from(list.querySelectorAll("*"))
    .filter((el) => el.closest("button") === null)
    .flatMap((el) => Array.from(el.classList));
  expect(classes.filter((name) => viewportVariant.test(name))).toEqual([]);
});

it("names the visitor pass on a line of its own until the row has room for the chip", () => {
  render(<OnSiteList entries={[entry]} canManage={false} onCheckOut={vi.fn()} />);

  const passes = screen.getAllByText(/badgeNumber 12/);
  // One meta line for a compact or medium row, one trailing chip for a wide one.
  expect(passes).toHaveLength(2);
  const pass = compactPass();
  expect(pass).toHaveClass("block", "truncate", "@3xl:hidden");
  expect(pass).not.toHaveClass("shrink-0");
  expect(pass.textContent).toBe("badgeNumber 12");
  const chip = passes.find((el) => el !== pass)?.closest(".hidden");
  expect(chip).toHaveClass("@3xl:inline-flex");
  expect(pass.contains(arrivalLine())).toBe(false);
  expect(arrivalLine().contains(pass)).toBe(false);
});

it("gives whom they came to see a line of its own that wraps instead of being cut", () => {
  render(<OnSiteList entries={[hosted]} canManage onCheckOut={vi.fn()} onPrintBadge={vi.fn()} />);

  const host = screen.getByText("host");
  expect(host).toHaveClass("block", "break-words");
  expect(host).not.toHaveClass("truncate");
  expect(host.className).not.toMatch(/hidden/);
  expect(host).toHaveAttribute("title", "host");
  expect(host.contains(arrivalLine())).toBe(false);
  expect(arrivalLine().contains(host)).toBe(false);
  expect(host.contains(compactPass())).toBe(false);

  // About, host over up to two lines, overdue, arrival and pass: the
  // meta holds five lines, the host before the arrival.
  const meta = host.parentElement;
  expect(meta).toHaveClass("line-clamp-5");
  expect(meta?.contains(arrivalLine())).toBe(true);
  expect(meta?.contains(compactPass())).toBe(true);
  const lines = Array.from(meta?.children ?? []);
  expect(lines.indexOf(host)).toBeLessThan(lines.indexOf(arrivalLine()));
});

it("never cuts the time a visitor came in, only the running stay after it", () => {
  render(<OnSiteList entries={[hosted]} canManage onCheckOut={vi.fn()} />);

  const time = screen.getByText("arrivedAt 02.00");
  expect(time).toHaveClass("shrink-0", "whitespace-nowrap");
  expect(time).not.toHaveClass("truncate");
  const stay = screen.getByText(/stayHours/);
  expect(stay).toHaveClass("min-w-0", "truncate");
  expect(stay.textContent).toBe("\u00a0· stayHours");
  // The whole of it stays readable where a pointer can hover.
  expect(arrivalLine()).toHaveAttribute("title", "arrivedAt 02.00 · stayHours");
});

it("keeps an overdue visitor's arrival time clear of the overdue mark in a compact row", () => {
  // On a phone the mark sat in front of the arrival on one line and left
  // it 66px: "Belum keluar  Masuk 0...", for the very visitors a guard
  // most needs the time for.
  render(<OnSiteList entries={[overdue]} canManage onCheckOut={vi.fn()} onPrintBadge={vi.fn()} />);

  const marks = screen.getAllByText("overdue");
  expect(marks).toHaveLength(2);
  const compactMark = document.querySelector("[data-slot='on-site-overdue']");
  expect(compactMark).toHaveClass("block", "@xl:hidden");
  expect(arrivalLine().contains(compactMark)).toBe(false);
  // Beside the arrival only from 36rem, where the row has room for both.
  const inlineMark = marks.find((mark) => arrivalLine().contains(mark));
  expect(inlineMark?.closest(".hidden")).toHaveClass("@xl:inline-flex", "shrink-0");

  const time = screen.getByText("arrivedAt 02.00");
  for (const mark of marks) {
    expect(mark.contains(time)).toBe(false);
    expect(time.contains(mark)).toBe(false);
  }
  // No truncating box holds both the mark and the time.
  let box: HTMLElement | null = time;
  while (box && box !== arrivalLine().parentElement) {
    expect(box).not.toHaveClass("truncate");
    box = box.parentElement;
  }
});

it("marks no visitor overdue who is not", () => {
  render(<OnSiteList entries={[hosted]} canManage onCheckOut={vi.fn()} />);

  expect(screen.queryByText("overdue")).not.toBeInTheDocument();
  expect(document.querySelector("[data-slot='on-site-overdue']")).toBeNull();
});

it("gives a compact row's lines to the host, arrival and pass, not the purpose", () => {
  render(<OnSiteList entries={[hosted]} canManage={false} onCheckOut={vi.fn()} />);

  const about = screen.getByText("Rapat");
  expect(about).toHaveClass("@max-xl:hidden");
  // Still readable in full where the row cuts it.
  expect(about).toHaveAttribute("title", "Rapat");
});

it("keeps the purpose in a compact row when there is no host to show", () => {
  render(<OnSiteList entries={[entry]} canManage={false} onCheckOut={vi.fn()} />);

  expect(screen.getByText("Rapat")).not.toHaveClass("@max-xl:hidden");
  expect(screen.queryByText("host")).not.toBeInTheDocument();
});

it("keeps the purpose in a compact row when there is no pass to show", () => {
  const noBadge: BoardEntry = {
    ...entry,
    visit: { ...entry.visit, host_user_id: "host-1", badge_number: "" },
  };
  render(<OnSiteList entries={[noBadge]} canManage={false} onCheckOut={vi.fn()} />);

  expect(screen.getByText("Rapat")).not.toHaveClass("@max-xl:hidden");
});

it("shows check out as an icon in a compact row, keeping its accessible name", () => {
  render(<OnSiteList entries={[entry]} canManage onCheckOut={vi.fn()} onPrintBadge={vi.fn()} />);

  const checkOut = screen.getByRole("button", { name: "checkOutFor" });
  expect(screen.getByText("checkOutShort")).toHaveClass("sr-only", "@xl:not-sr-only");
  expect(checkOut).toContainElement(screen.getByText("checkOutShort"));
});

it("offers to print an issued badge and hands the visit to the caller", async () => {
  const onPrintBadge = vi.fn();
  render(
    <OnSiteList entries={[entry]} canManage onCheckOut={vi.fn()} onPrintBadge={onPrintBadge} />,
  );

  await userEvent.click(screen.getByRole("button", { name: "printBadgeFor" }));
  expect(onPrintBadge).toHaveBeenCalledWith(expect.objectContaining({ id: "v1" }));
});

it("offers no print action for a visit with no badge", () => {
  const noBadge: BoardEntry = { ...entry, visit: { ...entry.visit, badge_number: "" } };
  render(<OnSiteList entries={[noBadge]} canManage onCheckOut={vi.fn()} onPrintBadge={vi.fn()} />);

  expect(screen.queryByRole("button", { name: "printBadgeFor" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "checkOutFor" })).toBeInTheDocument();
});
