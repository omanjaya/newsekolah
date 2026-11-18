import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TodayBoardView } from "./today-board-view";

const board = vi.hoisted(() => ({ rows: [] as unknown[], status: "" }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("@newsekolah/i18n", () => ({ formatTime: () => "07.00" }));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => true,
  useSession: () => ({ me: { tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../../../lib/hooks/use-url-state", () => ({
  useUrlState: () => [board.status, vi.fn()],
}));
vi.mock("../api", () => ({
  useStaffAttendanceTodayQuery: () => ({
    data: { data: board.rows },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("./correction-dialog", () => ({ CorrectionDialog: () => null }));
vi.mock("./manual-entry-dialog", () => ({ ManualEntryDialog: () => null }));

function renderBoard() {
  render(
    <TodayBoardView
      date="2026-11-18"
      today="2026-11-18"
      employees={[]}
      manualOpen={false}
      onManualOpenChange={vi.fn()}
      onOpenSchedule={vi.fn()}
    />,
  );
}

const row = {
  employee_user_id: "e1",
  employee_name: "Guru Contoh",
  status_code: "present",
  source: "self",
  late_minutes: 0,
  early_leave_minutes: 0,
};

describe("TodayBoardView", () => {
  beforeEach(() => {
    board.rows = [];
    board.status = "";
  });

  it("shows no search or status filter over an empty board", () => {
    renderBoard();

    expect(screen.getByText("today.emptyTitle")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /today\.columns\.status/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps the controls while a status filter is active, so it can be cleared", () => {
    board.status = "late";
    renderBoard();

    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("offers search and the status filter once the board has a row", () => {
    board.rows = [row];
    renderBoard();

    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /today\.columns\.status/ })).toBeInTheDocument();
  });
});
