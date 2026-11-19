import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { pickDate } from "../../../test/pick-date";

const mocks = vi.hoisted(() => ({
  useStaffAttendanceHistoryQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/staff-attendance",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../../lib/simulation/clock", () => ({
  useSimulation: () => undefined,
  // 2026-09-15T09:00 in Asia/Jakarta (UTC+7).
  businessNow: () => new Date("2026-09-15T02:00:00Z"),
}));
vi.mock("../api", () => ({
  todayInZone: () => "2026-09-15",
  useStaffAttendanceHistoryQuery: mocks.useStaffAttendanceHistoryQuery,
  useStaffAttendanceRecapQuery: () => ({ data: undefined, isLoading: false }),
  downloadStaffAttendanceRecap: vi.fn(),
  downloadAllStaffAttendanceRecap: vi.fn(),
}));
// The employee picker is the shared searchable Combobox (a popover and a
// cmdk list), which measures itself and scrolls its active option.
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): undefined {
        return undefined;
      }
      unobserve(): undefined {
        return undefined;
      }
      disconnect(): undefined {
        return undefined;
      }
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});

import { EmployeeRecapView } from "./employee-recap-view";

const EMPLOYEES = [{ id: "emp-1", name: "Budi" }];

describe("EmployeeRecapView filters", () => {
  beforeEach(() => {
    mocks.useStaffAttendanceHistoryQuery.mockReset();
    mocks.useStaffAttendanceHistoryQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/staff-attendance");
  });

  /** Picks the employee in the searchable picker, then shows any date range. */
  async function selectEmployee() {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "schedule.employee" }));
    await user.click(await screen.findByRole("option", { name: /Budi/ }));
    await user.click(screen.getByRole("radio", { name: "recap.byRange" }));
    return user;
  }

  it("sets a date range from the two date pickers and writes both bounds to the URL", async () => {
    render(<EmployeeRecapView employees={EMPLOYEES} />);
    const user = await selectEmployee();

    await user.click(screen.getByRole("button", { name: /^history\.dateRange/ }));
    await pickDate(user, "history.from", "2026-08-01");
    await pickDate(user, "history.to", "2026-08-15");

    expect(mocks.useStaffAttendanceHistoryQuery).toHaveBeenLastCalledWith(
      "emp-1",
      "2026-08-01",
      "2026-08-15",
    );
    expect(new URLSearchParams(window.location.search).get("from")).toBe("2026-08-01");
    expect(new URLSearchParams(window.location.search).get("to")).toBe("2026-08-15");
  });

  it("applies a preset and closes the popover", async () => {
    render(<EmployeeRecapView employees={EMPLOYEES} />);
    const user = await selectEmployee();

    await user.click(screen.getByRole("button", { name: /^history\.dateRange/ }));
    await user.click(await screen.findByRole("button", { name: "today" }));

    expect(mocks.useStaffAttendanceHistoryQuery).toHaveBeenLastCalledWith(
      "emp-1",
      "2026-09-15",
      "2026-09-15",
    );
  });

  it("shows history dates as readable calendar days, not raw ISO strings", async () => {
    mocks.useStaffAttendanceHistoryQuery.mockReturnValue({
      data: { data: [{ id: "r1", date: "2026-11-13", status_code: "present" }] },
      isLoading: false,
    });
    render(<EmployeeRecapView employees={EMPLOYEES} />);
    await selectEmployee();

    expect(screen.getAllByText("13 November 2026").length).toBeGreaterThan(0);
    expect(screen.queryByText("2026-11-13")).not.toBeInTheDocument();
  });
});
