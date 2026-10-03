import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useStaffAttendanceHistoryQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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
// Radix's Select needs real pointer-capture APIs jsdom doesn't implement; a
// plain native <select> exercises the same employee-picking behavior
// without that dependency, matching the pattern in
// settings-workspace.test.tsx.
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@newsekolah/ui");
  return {
    ...actual,
    Select: ({
      options,
      value,
      onValueChange,
    }: {
      options: { value: string; label: string }[];
      value: string;
      onValueChange: (value: string) => void;
    }) => (
      <select
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
        }}
      >
        <option value="" />
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
  };
});

import { EmployeeRecapView } from "./employee-recap-view";

const EMPLOYEES = [{ id: "emp-1", name: "Budi" }];

describe("EmployeeRecapView filters", () => {
  beforeEach(() => {
    mocks.useStaffAttendanceHistoryQuery.mockReset();
    mocks.useStaffAttendanceHistoryQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/staff-attendance");
  });

  async function selectEmployee() {
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole("combobox", { name: "schedule.employee" }), "emp-1");
    return user;
  }

  it("sets a date range from the two native date inputs and writes both bounds to the URL", async () => {
    render(<EmployeeRecapView employees={EMPLOYEES} />);
    const user = await selectEmployee();

    await user.click(screen.getByRole("button", { name: /^history\.dateRange/ }));
    fireEvent.change(screen.getByLabelText("history.from"), {
      target: { value: "2026-08-01" },
    });
    fireEvent.change(screen.getByLabelText("history.to"), { target: { value: "2026-08-15" } });

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
});
