import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SupervisionCycleDetailView } from "./supervision-cycle-detail-view";

const can = vi.fn(() => true);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => can() }));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([
    { id: "t1", name: "Guru Satu" },
    { id: "t2", name: "Guru Dua" },
  ]);
});
vi.mock("../lib/use-cycle-trail", () => ({ useCycleTrail: () => ({ cycle: () => [] }) }));
vi.mock("./cycle-nav", () => ({ CycleNav: () => null }));
vi.mock("./schedule-observation-form", () => ({ ScheduleObservationForm: () => null }));
vi.mock("../api", () => ({
  useSupervisionCycleQuery: () => ({
    data: {
      id: "c1",
      name: "Semester ganjil",
      instrument: {
        name: "Instrumen",
        scale_min: 1,
        scale_max: 4,
        criteria: [{ key: "plan", name: "Perencanaan" }],
      },
    },
    isLoading: false,
    isError: false,
  }),
  useScheduledObservationsQuery: () => ({
    data: {
      data: [
        {
          id: "s1",
          cycle_id: "c1",
          schedule_id: "x",
          lesson_date: "2026-11-02",
          teacher_user_id: "t1",
          observer_user_id: "o1",
          observation_id: "obs1",
          observed_at: "2026-11-02T01:00:00Z",
        },
        {
          id: "s2",
          cycle_id: "c1",
          schedule_id: "y",
          lesson_date: "2026-11-03",
          teacher_user_id: "t2",
          observer_user_id: "o1",
          observation_id: null,
          observed_at: null,
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

beforeEach(() => {
  can.mockReturnValue(true);
});

afterEach(cleanup);

function rowOf(name: string): HTMLElement {
  const row = screen.getAllByText(name)[0]?.closest<HTMLElement>("tr, li");
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

describe("SupervisionCycleDetailView", () => {
  it("marks observed visits done and opens their result instead of a new fill", () => {
    render(<SupervisionCycleDetailView cycleId="c1" />);
    const done = within(rowOf("Guru Satu"));
    expect(done.getByText("status.observed")).toBeInTheDocument();
    expect(done.getByRole("link", { name: "viewResult" })).toHaveAttribute(
      "href",
      "/supervision/observations/obs1",
    );
    expect(done.queryByRole("link", { name: "complete" })).not.toBeInTheDocument();

    const pending = within(rowOf("Guru Dua"));
    expect(pending.getByText("status.scheduled")).toBeInTheDocument();
    expect(pending.getByRole("link", { name: "complete" })).toHaveAttribute(
      "href",
      "/supervision/cycles/c1/observe/s2",
    );
  });

  it("lets a non-manager open a finished result but not fill a pending one", () => {
    can.mockReturnValue(false);
    render(<SupervisionCycleDetailView cycleId="c1" />);
    expect(within(rowOf("Guru Satu")).getByRole("link", { name: "viewResult" })).toBeVisible();
    expect(
      within(rowOf("Guru Dua")).queryByRole("link", { name: "complete" }),
    ).not.toBeInTheDocument();
  });
});
