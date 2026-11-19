import { render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: { id: "me-1", permissions: [], roles: [], duties: [], disabled_modules: [] },
  }),
}));
vi.mock("../../substitutions/api", () => ({
  useSubstitutionsQuery: () => ({ data: undefined }),
}));
vi.mock("./schedule-current-period-pill", () => ({
  ScheduleCurrentPeriodPill: () => <span>pill:now</span>,
}));

import { useScheduleHeader } from "./use-schedule-header";

describe("useScheduleHeader", () => {
  it("returns the year and the period as toolbar context, not as a header description", () => {
    const { result } = renderHook(() =>
      useScheduleHeader({
        canManage: false,
        isStudent: true,
        className: "X-A",
        yearLabel: "2026/2027",
        onAdd: vi.fn(),
      }),
    );

    // The calendar and substitutions tabs have no description, so the
    // timetable must not add one: the area's tab strip would move.
    expect(result.current).not.toHaveProperty("description");
    render(<>{result.current.context}</>);
    const context = screen.getByTestId("schedule-context");
    expect(context).toHaveTextContent("X-A · 2026/2027");
    expect(context).toHaveTextContent("pill:now");
  });

  it("names only the year to a reader who is not a student", () => {
    const { result } = renderHook(() =>
      useScheduleHeader({
        canManage: true,
        isStudent: false,
        className: "X-A",
        yearLabel: "2026/2027",
        onAdd: vi.fn(),
      }),
    );

    render(<>{result.current.context}</>);
    expect(screen.getByTestId("schedule-context")).toHaveTextContent(/^2026\/2027/);
  });
});
