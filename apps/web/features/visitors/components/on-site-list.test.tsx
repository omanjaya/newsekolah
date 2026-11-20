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
vi.mock("../../reference/directory-names", () => ({ useDirectoryNames: () => new Map() }));

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
  // A long host and arrival line truncates; the pass number must not go with it.
  expect(phonePass?.closest(".truncate")).toBeNull();
  expect(phonePass).toHaveClass("shrink-0");
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
