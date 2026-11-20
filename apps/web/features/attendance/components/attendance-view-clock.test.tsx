import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "../../../lib/session/session-provider";
import {
  clearSimulation,
  setSimulation,
  syncSimulationIdentity,
} from "../../../lib/simulation/clock";
import type * as ReferenceApiModule from "../../reference/api";
import type * as AttendanceApiModule from "../api";

import { DaySessions } from "./attendance-view";

// The real clock reads Wed 2 Dec 2026 04:17 in Makassar (UTC+8): before
// the 07:00 lesson, so it would be "next".
const REAL_NOW = new Date("2026-12-01T20:17:00Z");
// The simulated clock reads 07:05 the same day: the lesson is running.
const SIMULATED = new Date("2026-12-01T23:05:00Z");

const me = {
  id: "me-1",
  permissions: ["platform_superadmin"],
  profile_kind: "teacher",
  modules: [],
  tenant: { tenant_id: "tenant-1", timezone: "Asia/Makassar" },
  roles: [{ id: "r1", slug: "teacher", name: "Guru" }],
} as unknown as Me;

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => "Rabu, 2 Desember" }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../dashboard/api", () => ({ useAdminDashboardQuery: () => ({ data: undefined }) }));
vi.mock("@newsekolah/i18n", () => ({ formatTime: () => "07.05" }));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me }),
  useCan: () => false,
}));
vi.mock("../../../lib/hooks/use-active-year", () => ({
  useActiveYear: () => ({ id: "year-1", label: "2026/2027" }),
}));
vi.mock("../../../lib/hooks/use-date-filter", () => ({
  useDateFilter: (_key: string, fallback: string) => [fallback, vi.fn()],
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../schedule/api", () => ({
  useTeacherOptionsQuery: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("../../reference/api", async () => {
  const actual = await vi.importActual<typeof ReferenceApiModule>("../../reference/api");
  return {
    ...actual,
    useClassesQuery: () => ({ data: { data: [{ id: "class-1", name: "X-A" }] } }),
    useSubjectsQuery: () => ({ data: { data: [{ id: "subject-1", name: "Matematika" }] } }),
    useAllPeriodsQuery: () => ({
      data: {
        data: [
          { id: "p1", name: "Jam 1", sequence: 1, starts_at: "07:00:00", ends_at: "23:59:00" },
        ],
      },
    }),
    useSchoolDaysQuery: () => ({
      data: { data: [{ day_of_week: 3, is_active: true }] },
      isLoading: false,
    }),
  };
});
// The view's own time helpers stay real: they read the business clock.
vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof AttendanceApiModule>("../api");
  return {
    ...actual,
    useTodaySessionsQuery: () => ({
      data: {
        data: [
          {
            id: "s1",
            schedule_id: "sched-1",
            date: "2026-12-02",
            class_id: "class-1",
            subject_id: "subject-1",
            teacher_user_id: "me-1",
            start_period_id: "p1",
            end_period_id: "p1",
            is_substitute: false,
          },
        ],
      },
      isLoading: false,
    }),
    useOpenSessionMutation: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
      variables: undefined,
    }),
  };
});

describe("DaySessions on the business clock", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: REAL_NOW, toFake: ["Date", "setInterval", "clearInterval"] });
  });
  afterEach(() => {
    clearSimulation();
    vi.useRealTimers();
  });

  it("re-reads the time at once when the simulated clock is applied after the first render", () => {
    // A full page load: the view renders on the real clock, and the stored
    // simulation is applied afterwards (SimulationSync's effect).
    render(<DaySessions />);
    expect(screen.getByTestId("attendance-session-hero")).toHaveTextContent("heroNext");

    act(() => {
      syncSimulationIdentity(me);
      setSimulation("frozen", SIMULATED);
    });

    // No 30 s tick has passed: the hero follows the clock right away.
    expect(screen.getByTestId("attendance-session-hero")).toHaveTextContent("heroOngoing");
  });

  it("follows the real clock forward on its 30 s tick", () => {
    render(<DaySessions />);
    expect(screen.getByTestId("attendance-session-hero")).toHaveTextContent("heroNext");

    // 04:17 to 07:00:30 on the real clock.
    act(() => {
      vi.advanceTimersByTime((2 * 60 + 43) * 60_000 + 30_000);
    });
    expect(screen.getByTestId("attendance-session-hero")).toHaveTextContent("heroOngoing");
  });
});
