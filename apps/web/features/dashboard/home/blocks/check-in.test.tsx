import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const historyQuery = vi.hoisted(() => vi.fn());
const scanMutation = vi.hoisted(() => vi.fn());
const mutate = vi.hoisted(() => vi.fn());

vi.mock("../../../staff-attendance/api", () => ({
  useStaffAttendanceMyHistoryQuery: historyQuery,
  useScanStaffAttendanceMutation: scanMutation,
}));
vi.mock("../../../../lib/tenant-date", () => ({ todayInZone: () => "2026-09-26" }));
vi.mock("../../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("@newsekolah/ui", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => true }),
  useLocale: () => "id",
}));

import { EMPTY_BLOCK } from "../types";
import type { Me } from "../types";

import { useCheckInBlock } from "./check-in";

const me = { tenant: { timezone: "Asia/Jakarta" }, permissions: [] } as unknown as Me;

function history(record: Record<string, unknown> | undefined) {
  return {
    data: { data: record ? [record] : [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
}

beforeEach(() => {
  historyQuery.mockReset();
  mutate.mockReset();
  scanMutation.mockReset().mockReturnValue({ mutate, isPending: false });
});

describe("useCheckInBlock", () => {
  it("returns EMPTY_BLOCK and keeps the history query idle when inactive", () => {
    historyQuery.mockReturnValue(history(undefined));

    const { result } = renderHook(() => useCheckInBlock(me, false));

    expect(result.current).toBe(EMPTY_BLOCK);
    expect(historyQuery).toHaveBeenCalledWith("", "");
  });

  it("offers check-in when nothing is recorded today and scans on click", () => {
    historyQuery.mockReturnValue(history(undefined));

    const { result } = renderHook(() => useCheckInBlock(me, true));
    expect(result.current.side.map((slot) => slot.key)).toEqual(["checkIn.card"]);
    render(<>{result.current.side[0]?.node}</>);
    fireEvent.click(screen.getByRole("button", { name: "checkIn" }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "openPage" })).toHaveAttribute("href", "/check-in");
  });

  it("keeps the check-in button secondary, leaving the home's one primary to the hero", () => {
    historyQuery.mockReturnValue(history(undefined));

    const { result } = renderHook(() => useCheckInBlock(me, true));
    render(<>{result.current.side[0]?.node}</>);

    const button = screen.getByRole("button", { name: "checkIn" });
    expect(button).toHaveClass("bg-surface");
    expect(button).not.toHaveClass("bg-accent");
  });

  it("shows one compact row with the day's state and no placeholder times before arrival", () => {
    historyQuery.mockReturnValue(
      history({
        date: "2026-09-26",
        status_code: "unscheduled",
        arrival_at: null,
        departure_at: null,
        late_minutes: 0,
      }),
    );

    const { result } = renderHook(() => useCheckInBlock(me, true));
    render(<>{result.current.side[0]?.node}</>);

    expect(screen.getByTestId("check-in-state")).toHaveTextContent("unscheduled");
    expect(screen.queryByText("arrival")).not.toBeInTheDocument();
    expect(screen.queryByText("–")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "checkIn" })).toBeInTheDocument();
  });

  it("offers check-out once arrival is recorded", () => {
    historyQuery.mockReturnValue(
      history({
        date: "2026-09-26",
        status_code: "present",
        arrival_at: "2026-09-26T00:00:00Z",
        departure_at: null,
        late_minutes: 0,
      }),
    );

    const { result } = renderHook(() => useCheckInBlock(me, true));
    render(<>{result.current.side[0]?.node}</>);

    expect(screen.getByRole("button", { name: "checkOut" })).toBeInTheDocument();
  });

  it("hides the button once departure is recorded", () => {
    historyQuery.mockReturnValue(
      history({
        date: "2026-09-26",
        status_code: "present",
        arrival_at: "2026-09-26T00:00:00Z",
        departure_at: "2026-09-26T08:00:00Z",
        late_minutes: 0,
      }),
    );

    const { result } = renderHook(() => useCheckInBlock(me, true));
    render(<>{result.current.side[0]?.node}</>);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("done")).toBeInTheDocument();
  });

  it("follows a refetched day once it is newer than the arrival scan", () => {
    let updatedAt = 0;
    let today: Record<string, unknown> = {
      date: "2026-09-26",
      status_code: "unscheduled",
      arrival_at: null,
      departure_at: null,
      late_minutes: 0,
    };
    historyQuery.mockImplementation(() => ({ ...history(today), dataUpdatedAt: updatedAt }));
    mutate.mockImplementation(
      (_input: undefined, options: { onSuccess: (saved: unknown) => void }) => {
        options.onSuccess({ ...today, arrival_at: "2026-09-26T01:00:00Z" });
      },
    );

    const hook = renderHook(() => useCheckInBlock(me, true));
    const view = render(<>{hook.result.current.side[0]?.node}</>);
    fireEvent.click(screen.getByRole("button", { name: "checkIn" }));
    expect(screen.getByText("unscheduled")).toBeInTheDocument();

    // A schedule saved after the scan re-judges the arrival as late.
    today = { ...today, status_code: "late", arrival_at: "2026-09-26T01:00:00Z", late_minutes: 50 };
    updatedAt = Date.now() + 1000;
    hook.rerender();
    view.rerender(<>{hook.result.current.side[0]?.node}</>);

    expect(screen.queryByText("unscheduled")).not.toBeInTheDocument();
    expect(screen.getByText("late")).toBeInTheDocument();
    expect(screen.getByText("lateBy")).toBeInTheDocument();
  });

  it("returns EMPTY_BLOCK and keeps the history query idle while staff attendance is off", () => {
    historyQuery.mockReturnValue(history(undefined));
    const off = { ...me, disabled_modules: ["staff_attendance"] };

    const { result } = renderHook(() => useCheckInBlock(off, true));

    expect(result.current).toBe(EMPTY_BLOCK);
    expect(historyQuery).toHaveBeenCalledWith("", "");
  });
});
