import type * as UiModule from "@newsekolah/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SelfCheckInView } from "./self-check-in-view";

const weekQuery = vi.hoisted(() => vi.fn());
const scanMutation = vi.hoisted(() => vi.fn());
const clockDay = vi.hoisted(() => ({ value: "2026-09-24" }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${Object.values(vars).join(",")}` : key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (key: string) => key,
}));
vi.mock("../../../lib/tenant-date", () => ({
  todayInZone: () => clockDay.value,
}));
vi.mock("../api", () => ({
  useScanStaffAttendanceMutation: () => ({ mutate: scanMutation, isPending: false }),
  useStaffAttendanceMyHistoryQuery: weekQuery,
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});
afterEach(() => {
  cleanup();
  clockDay.value = "2026-09-24";
  scanMutation.mockReset();
  weekQuery.mockReset();
});

function record(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    employee_user_id: "u1",
    employee_name: "Guru Contoh",
    date: "2026-09-24",
    arrival_at: null,
    departure_at: null,
    status_code: "unscheduled",
    late_minutes: 0,
    early_leave_minutes: 0,
    source: "manual",
    ...overrides,
  };
}

describe("SelfCheckInView -- unscheduled vs. holiday", () => {
  it("does not carry a completed scan into the next simulated school day", () => {
    weekQuery.mockImplementation(() => ({
      data: { data: [record({ date: clockDay.value })] },
      isLoading: false,
      isError: false,
    }));
    scanMutation.mockImplementation(
      (_input: undefined, options: { onSuccess: (saved: unknown) => void }) => {
        options.onSuccess(
          record({
            date: clockDay.value,
            arrival_at: "2026-09-24T01:00:00Z",
            departure_at: "2026-09-24T08:00:00Z",
          }),
        );
      },
    );
    const view = render(<SelfCheckInView />);
    fireEvent.click(screen.getByRole("button", { name: "recordArrival" }));
    expect(screen.queryByRole("button", { name: "recordArrival" })).not.toBeInTheDocument();

    clockDay.value = "2026-09-25";
    view.rerender(<SelfCheckInView />);
    expect(screen.getByRole("button", { name: "recordArrival" })).toBeEnabled();
  });

  it("never labels an unscheduled day as a holiday, and keeps the primary action available", () => {
    weekQuery.mockReturnValue({
      data: { data: [record({ status_code: "unscheduled" })] },
      isLoading: false,
      isError: false,
    });
    render(<SelfCheckInView />);

    // The regression this guards: an employee with no schedule configured
    // must never see "Libur" (holiday) next to an active check-in button.
    // The "this week" list repeats today's own row, so these labels
    // legitimately appear more than once -- assert presence, not count.
    expect(screen.queryByText("holiday")).not.toBeInTheDocument();
    expect(screen.getAllByText("unscheduled").length).toBeGreaterThan(0);
    expect(screen.getByText("unscheduledHint")).toBeInTheDocument();
    expect(screen.queryByText("holidayHint")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "recordArrival" })).toBeEnabled();
  });

  it("names a true holiday when the calendar provides one, and shows the holiday hint", () => {
    weekQuery.mockReturnValue({
      data: {
        data: [record({ status_code: "holiday", holiday_name: "Hari Kemerdekaan" })],
      },
      isLoading: false,
      isError: false,
    });
    render(<SelfCheckInView />);

    expect(screen.getAllByText("holidayWithName:Hari Kemerdekaan").length).toBeGreaterThan(0);
    expect(screen.getByText("holidayHint")).toBeInTheDocument();
    expect(screen.queryByText("unscheduledHint")).not.toBeInTheDocument();
    // The action stays available (the API accepts a scan on a holiday
    // too), just de-emphasised rather than disabled outright.
    expect(screen.getByRole("button", { name: "recordArrival" })).toBeEnabled();
  });

  it("falls back to the plain holiday label when no calendar event is on record", () => {
    weekQuery.mockReturnValue({
      data: { data: [record({ status_code: "holiday", holiday_name: undefined })] },
      isLoading: false,
      isError: false,
    });
    render(<SelfCheckInView />);

    expect(screen.getAllByText("holiday").length).toBeGreaterThan(0);
    expect(screen.queryByText(/holidayWithName/)).not.toBeInTheDocument();
  });
});
