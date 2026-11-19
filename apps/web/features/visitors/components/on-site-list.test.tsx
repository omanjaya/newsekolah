import { render, screen } from "@testing-library/react";
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
  expect(passes.some((el) => el.classList.contains("sm:hidden"))).toBe(true);
});
