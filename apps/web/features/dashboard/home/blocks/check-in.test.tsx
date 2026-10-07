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
    expect(result.current.left.map((slot) => slot.key)).toEqual(["checkIn.card"]);
    render(<>{result.current.left[0]?.node}</>);
    fireEvent.click(screen.getByRole("button", { name: "checkIn" }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "openPage" })).toHaveAttribute("href", "/check-in");
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
    render(<>{result.current.left[0]?.node}</>);

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
    render(<>{result.current.left[0]?.node}</>);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("done")).toBeInTheDocument();
  });
});
