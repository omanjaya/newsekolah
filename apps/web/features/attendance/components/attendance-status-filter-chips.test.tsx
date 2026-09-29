import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AttendanceStatusFilterChips } from "./attendance-status-filter-chips";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const STATUSES = [
  { code: "H", label: "Hadir", color: "green", counts_as_present: true },
  { code: "S", label: "Sakit", color: "yellow", counts_as_present: false },
  { code: "I", label: "Izin", color: "blue", counts_as_present: false },
  { code: "D", label: "Dispensasi", color: "purple", counts_as_present: false },
  { code: "A", label: "Alpha", color: "red", counts_as_present: false },
];

describe("AttendanceStatusFilterChips", () => {
  it("renders one tile per status with its count", () => {
    render(
      <AttendanceStatusFilterChips
        statuses={STATUSES}
        counts={{ H: 30, S: 2, I: 1, D: 0, A: 0 }}
        active={new Set()}
        onToggle={() => undefined}
      />,
    );
    const tiles = screen.getAllByRole("button");
    expect(tiles).toHaveLength(5);
    expect(screen.getByRole("button", { name: /Sakit/ })).toHaveTextContent("2");
  });

  it("marks the active tile with aria-pressed and calls onToggle with its code", async () => {
    const onToggle = vi.fn();
    render(
      <AttendanceStatusFilterChips
        statuses={STATUSES}
        counts={{ H: 30, S: 2, I: 1, D: 0, A: 0 }}
        active={new Set(["S"])}
        onToggle={onToggle}
      />,
    );
    const sick = screen.getByRole("button", { name: /Sakit/ });
    const present = screen.getByRole("button", { name: /Hadir/ });
    expect(sick).toHaveAttribute("aria-pressed", "true");
    expect(present).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(present);
    expect(onToggle).toHaveBeenCalledWith("H");
  });
});
