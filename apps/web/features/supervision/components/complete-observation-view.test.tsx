import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CompleteObservationView } from "./complete-observation-view";

const observationId = vi.fn<() => string | null>();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([{ id: "t1", name: "Guru Satu" }]);
});
vi.mock("../lib/use-cycle-trail", () => ({
  cycleHref: (id: string) => `/supervision/cycles/${id}`,
  useCycleTrail: () => ({ within: () => [] }),
}));
vi.mock("../lib/use-lesson-context", () => ({ useLessonContext: () => ({}) }));
vi.mock("./complete-observation-form", () => ({
  CompleteObservationForm: () => <form aria-label="observation form" />,
}));
vi.mock("../api", () => ({
  useSupervisionCycleQuery: () => ({
    data: { id: "c1", name: "Siklus", instrument: { criteria: [] } },
    isLoading: false,
    isError: false,
  }),
  useScheduledObservationsQuery: () => ({
    data: {
      data: [
        {
          id: "s1",
          lesson_date: "2026-11-02",
          teacher_user_id: "t1",
          schedule_id: "x",
          observation_id: observationId(),
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));

afterEach(cleanup);

describe("CompleteObservationView", () => {
  it("opens the form for a visit still to be observed", () => {
    observationId.mockReturnValue(null);
    render(<CompleteObservationView cycleId="c1" scheduledId="s1" />);
    expect(screen.getByRole("form", { name: "observation form" })).toBeInTheDocument();
  });

  it("links the saved result instead of a second fill for an observed visit", () => {
    observationId.mockReturnValue("obs1");
    render(<CompleteObservationView cycleId="c1" scheduledId="s1" />);
    expect(screen.queryByRole("form", { name: "observation form" })).not.toBeInTheDocument();
    expect(screen.getByText("doneTitle")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "viewResult" })).toHaveAttribute(
      "href",
      "/supervision/observations/obs1",
    );
  });
});
