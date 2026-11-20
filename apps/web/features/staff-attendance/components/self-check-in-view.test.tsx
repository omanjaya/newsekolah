import type * as UiModule from "@newsekolah/ui";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SelfCheckInView } from "./self-check-in-view";

const weekQuery = vi.hoisted(() => vi.fn());
const scanMutation = vi.hoisted(() => vi.fn());
const clockDay = vi.hoisted(() => ({ value: "2026-09-24" }));
const session = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${Object.values(vars).join(",")}` : key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: {
      profile_kind: "teacher",
      permissions: session.permissions,
      tenant: { timezone: "Asia/Jakarta" },
    },
  }),
  useCan: (permission: string) => session.permissions.includes(permission),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/check-in" }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
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
  session.permissions = [];
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
      dataUpdatedAt: 0,
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
    expect(screen.queryByText("holiday")).not.toBeInTheDocument();
    expect(screen.queryByText("holidayHint")).not.toBeInTheDocument();
    // The warning states the unscheduled day once (FA-47, f6595bc5): no
    // status pill in the card and no badge on the day's row, which reads
    // that nothing was recorded instead of an empty time range.
    expect(screen.getAllByText("unscheduledHint")).toHaveLength(1);
    expect(screen.queryByText("unscheduled")).not.toBeInTheDocument();
    expect(screen.getByText("noRecord")).toBeInTheDocument();
    expect(screen.queryByText("unscheduledHintManage")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "recordArrival" })).toBeEnabled();
  });

  it("points a schedule manager at the schedule editor on an unscheduled day", () => {
    session.permissions = ["manage_staff_attendance_schedules"];
    weekQuery.mockReturnValue({
      data: { data: [record({ status_code: "unscheduled" })] },
      isLoading: false,
      isError: false,
    });
    render(<SelfCheckInView />);

    expect(screen.getByText(/unscheduledHintManage/)).toBeInTheDocument();
    expect(screen.queryByText("unscheduledHint")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "openSchedule" })).toHaveAttribute(
      "href",
      "/staff-attendance?tab=schedule",
    );
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

describe("SelfCheckInView -- after arriving", () => {
  it("offers the departure next and says how late the arrival was", () => {
    weekQuery.mockReturnValue({
      data: {
        data: [
          record({ status_code: "late", arrival_at: "2026-09-24T00:20:00Z", late_minutes: 20 }),
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<SelfCheckInView />);

    // 00.20 UTC is 07.20 on the school's clock in Asia/Jakarta.
    expect(screen.getAllByText("07.20").length).toBeGreaterThan(0);
    expect(screen.getByText("lateBy:20")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "recordDeparture" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "recordArrival" })).not.toBeInTheDocument();
  });

  it("says a failed week did not load instead of showing an empty week", () => {
    weekQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
      refetch: vi.fn(),
    });
    render(<SelfCheckInView />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("thisWeekEmpty")).not.toBeInTheDocument();
  });
});

describe("SelfCheckInView -- a schedule saved after the arrival scan", () => {
  it("follows the refetched day once it is newer than the scan response", () => {
    let today = record();
    let updatedAt = 0;
    weekQuery.mockImplementation(() => ({
      data: { data: [today] },
      dataUpdatedAt: updatedAt,
      isLoading: false,
      isError: false,
    }));
    scanMutation.mockImplementation(
      (_input: undefined, options: { onSuccess: (saved: unknown) => void }) => {
        options.onSuccess(record({ arrival_at: "2026-09-24T01:00:00Z" }));
      },
    );
    const view = render(<SelfCheckInView />);
    fireEvent.click(screen.getByRole("button", { name: "recordArrival" }));
    // The scan response shows at once, before any refetch.
    expect(screen.getAllByText("unscheduledHint")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "recordDeparture" })).toBeEnabled();

    // The admin saves a first schedule; the API re-judges the arrival as
    // late, and a later my-history refetch brings that back.
    today = record({ status_code: "late", arrival_at: "2026-09-24T01:00:00Z", late_minutes: 50 });
    updatedAt = Date.now() + 1000;
    view.rerender(<SelfCheckInView />);

    expect(screen.queryByText("unscheduledHint")).not.toBeInTheDocument();
    expect(screen.getByText("lateBy:50")).toBeInTheDocument();
    // The card's pill and the week's row agree on the same day.
    expect(screen.getAllByText("late")).toHaveLength(2);
  });
});

describe("SelfCheckInView -- the way to the school-wide board", () => {
  function emptyWeek() {
    weekQuery.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
  }

  it("links a reader of the board to it from the header, the way the board links back", () => {
    session.permissions = ["view_staff_attendance"];
    emptyWeek();
    render(<SelfCheckInView />);

    expect(screen.getByRole("link", { name: "navLabel" })).toHaveAttribute(
      "href",
      "/staff-attendance",
    );
    // No tab strip that the board's own page would not show.
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("offers no link to an employee who may not open the board", () => {
    emptyWeek();
    render(<SelfCheckInView />);

    expect(screen.queryByRole("link", { name: "navLabel" })).not.toBeInTheDocument();
  });
});

describe("SelfCheckInView -- departure right after arrival", () => {
  it("asks before recording departure and sends nothing until confirmed", () => {
    weekQuery.mockReturnValue({
      data: {
        data: [record({ status_code: "present", arrival_at: "2026-09-24T00:06:55Z" })],
      },
      isLoading: false,
      isError: false,
    });
    render(<SelfCheckInView />);

    // The second tap lands on the button that just recorded arrival.
    fireEvent.click(screen.getByRole("button", { name: "recordDeparture" }));
    expect(scanMutation).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("confirmDepartureTitle");
    // The body names the recorded arrival time.
    expect(dialog).toHaveTextContent(/confirmDepartureBody:07[.:]06/);

    fireEvent.click(within(dialog).getByRole("button", { name: "recordDeparture" }));
    expect(scanMutation).toHaveBeenCalledTimes(1);
  });

  it("records arrival straight away", () => {
    weekQuery.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    render(<SelfCheckInView />);

    fireEvent.click(screen.getByRole("button", { name: "recordArrival" }));
    expect(scanMutation).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
