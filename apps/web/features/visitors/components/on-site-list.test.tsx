import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values && "number" in values ? `${key} ${String(values.number)}` : key,
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

it("names the visitor pass in the meta line for a phone, where the trailing badge is hidden", () => {
  render(<OnSiteList entries={[entry]} canManage={false} onCheckOut={vi.fn()} />);

  const passes = screen.getAllByText(/badgeNumber 12/);
  // One for the phone (meta line, hidden from sm), one for wider screens (trailing badge).
  expect(passes).toHaveLength(2);
  const phonePass = passes.find((el) => el.classList.contains("sm:hidden"));
  expect(phonePass).toBeDefined();
  // Its own line: it shared one with the host and arrival, refused to
  // shrink, and squeezed that text to nothing beside the row's buttons
  // while its own end ("TAMU-2/XI/2") was cut off with a stray separator.
  expect(phonePass).toHaveClass("block", "truncate");
  expect(phonePass).not.toHaveClass("shrink-0");
  expect(phonePass?.textContent).toBe("badgeNumber 12");
  const arrival = screen.getByText(/arrived/);
  expect(phonePass?.contains(arrival)).toBe(false);
  expect(arrival.parentElement?.contains(phonePass ?? null)).toBe(false);
});

it("gives whom they came to see a line of its own, apart from the arrival and the pass", () => {
  const hosted: BoardEntry = { ...entry, visit: { ...entry.visit, host_user_id: "host-1" } };
  render(<OnSiteList entries={[hosted]} canManage onCheckOut={vi.fn()} onPrintBadge={vi.fn()} />);

  // Sharing one line with "Masuk 06.45 · 5 j 42 mnt" left the host cut to
  // "Menemui Kep..." on a phone and in the board's desktop column.
  const host = screen.getByText("host");
  expect(host).toHaveClass("block");
  expect(host).not.toHaveClass("max-sm:hidden", "sm:hidden");
  expect(host).toHaveAttribute("title", "host");
  const arrival = screen.getByText("arrived");
  expect(arrival.textContent).toBe("arrived");
  expect(host.contains(arrival)).toBe(false);
  expect(arrival.contains(host)).toBe(false);
  expect(arrival).toHaveAttribute("title", "arrived");
  const phonePass = screen
    .getAllByText(/badgeNumber 12/)
    .find((el) => el.classList.contains("sm:hidden"));
  expect(host.contains(phonePass ?? null)).toBe(false);

  // Host, arrival and pass: the row's meta holds all three lines, and one
  // more for a host that wraps on a phone.
  const meta = host.parentElement;
  expect(meta).toHaveClass("line-clamp-4");
  expect(meta?.contains(arrival)).toBe(true);
  expect(meta?.contains(phonePass ?? null)).toBe(true);
  expect(Array.from(meta?.children ?? []).indexOf(host)).toBeLessThan(
    Array.from(meta?.children ?? []).indexOf(arrival.parentElement as Element),
  );
});

it("lets the host wrap on a phone, where one line cuts it and a title cannot be read", () => {
  const hosted: BoardEntry = { ...entry, visit: { ...entry.visit, host_user_id: "host-1" } };
  render(<OnSiteList entries={[hosted]} canManage onCheckOut={vi.fn()} onPrintBadge={vi.fn()} />);

  const host = screen.getByText("host");
  // Below sm nothing cuts it; from sm, beside the trailing badge, it keeps
  // one line and its title.
  expect(host).not.toHaveClass("truncate");
  expect(host).toHaveClass("break-words", "sm:truncate");
});

it("gives a phone's lines to the host, arrival and pass, not the purpose", () => {
  const hosted: BoardEntry = { ...entry, visit: { ...entry.visit, host_user_id: "host-1" } };
  render(<OnSiteList entries={[hosted]} canManage={false} onCheckOut={vi.fn()} />);

  const about = screen.getByText("Rapat");
  expect(about).toHaveClass("max-sm:hidden");
  // Still readable in full where the row cuts it.
  expect(about).toHaveAttribute("title", "Rapat");
});

it("keeps the purpose on a phone when there is no host to show", () => {
  render(<OnSiteList entries={[entry]} canManage={false} onCheckOut={vi.fn()} />);

  expect(screen.getByText("Rapat")).not.toHaveClass("max-sm:hidden");
  expect(screen.queryByText("host")).not.toBeInTheDocument();
});

it("keeps the purpose on a phone when there is no pass to show", () => {
  const noBadge: BoardEntry = {
    ...entry,
    visit: { ...entry.visit, host_user_id: "host-1", badge_number: "" },
  };
  render(<OnSiteList entries={[noBadge]} canManage={false} onCheckOut={vi.fn()} />);

  expect(screen.getByText("Rapat")).not.toHaveClass("max-sm:hidden");
});

it("shows check out as an icon on a phone, keeping its accessible name", () => {
  render(<OnSiteList entries={[entry]} canManage onCheckOut={vi.fn()} onPrintBadge={vi.fn()} />);

  const checkOut = screen.getByRole("button", { name: "checkOutFor" });
  expect(screen.getByText("checkOutShort")).toHaveClass("sr-only", "sm:not-sr-only");
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
