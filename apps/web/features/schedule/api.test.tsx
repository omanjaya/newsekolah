import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSchedulesQuery, type ScheduleFilter } from "./api";

const get = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api/client", () => ({
  useApiClient: () => ({ GET: get }),
}));

function wrapper({ children }: { children: ReactNode }): ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function render(filter: ScheduleFilter) {
  return renderHook(() => useSchedulesQuery(filter), { wrapper });
}

describe("useSchedulesQuery", () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue({ data: [] });
  });

  // A student not placed in a class has no current_class: the home block
  // still passes today's day. That used to turn into the whole-school day
  // view (GET /v1/schedules?academic_year_id&day_of_week), which the API
  // refuses with 403 for anyone without full schedule access.
  it("never widens a class view with a missing class into the all-classes day view", async () => {
    const { result } = render({ academicYearId: "y1", classId: undefined, dayOfWeek: 5 });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(get).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("runs the whole-school day view only when asked for it explicitly", async () => {
    render({ academicYearId: "y1", dayOfWeek: 5, allClasses: true });

    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(1);
    });
    expect(get).toHaveBeenCalledWith("/v1/schedules", {
      params: { query: { academic_year_id: "y1", day_of_week: 5 } },
    });
  });

  it("narrows a class view to one day", async () => {
    render({ academicYearId: "y1", classId: "c1", dayOfWeek: 5 });

    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(1);
    });
    expect(get).toHaveBeenCalledWith("/v1/schedules", {
      params: { query: { academic_year_id: "y1", class_id: "c1", day_of_week: 5 } },
    });
  });
});
