import { ApiError } from "@newsekolah/api-client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CompleteObservationView } from "./complete-observation-view";

const observationId = vi.fn<() => string | null>();
// Each query's state: "ok" (its data), "loading", or the error it failed with.
const queries = vi.hoisted<{
  cycle: unknown;
  list: unknown;
  result: (mode: unknown, data: unknown) => Record<string, unknown>;
}>(() => ({
  cycle: "ok",
  list: "ok",
  result(mode: unknown, data: unknown) {
    if (mode === "ok") return { data, isLoading: false, isPending: false, isError: false };
    if (mode === "loading") {
      return { data: undefined, isLoading: true, isPending: true, isError: false };
    }
    return { data: undefined, isLoading: false, isPending: false, isError: true, error: mode };
  },
}));

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
  useSupervisionCycleQuery: () =>
    queries.result(queries.cycle, { id: "c1", name: "Siklus", instrument: { criteria: [] } }),
  useScheduledObservationsQuery: () =>
    queries.result(queries.list, {
      data: [
        {
          id: "s1",
          lesson_date: "2026-11-02",
          teacher_user_id: "t1",
          schedule_id: "x",
          observation_id: observationId(),
        },
      ],
    }),
}));

const malformedId = (field: string) =>
  new ApiError({
    status: 400,
    code: "VALIDATION_FAILED",
    message: "invalid",
    details: [{ field, code: "INVALID_FORMAT" }],
  });

afterEach(() => {
  cleanup();
  queries.cycle = "ok";
  queries.list = "ok";
});

describe("CompleteObservationView", () => {
  it("shows the cycle's not-found page, with no retry, for a malformed cycle id", () => {
    queries.cycle = malformedId("cycleId");
    queries.list = malformedId("cycleId");
    render(<CompleteObservationView cycleId="abc" scheduledId="abc" />);
    expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backToCycles" })).toHaveAttribute(
      "href",
      "/supervision/cycles",
    );
    expect(screen.queryByRole("button", { name: "actions.retry" })).not.toBeInTheDocument();
  });

  // Both requests fail for the same id in parallel; whichever lands first,
  // no retryable failure shows on the way to the not-found page.
  it("never offers a retry for a malformed cycle id while the cycle is still loading", () => {
    queries.cycle = "loading";
    queries.list = malformedId("cycleId");
    render(<CompleteObservationView cycleId="abc" scheduledId="abc" />);
    expect(screen.queryByRole("button", { name: "actions.retry" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
  });

  it("waits for the cycle before telling a failed list as a failure to retry", () => {
    queries.cycle = "loading";
    queries.list = new ApiError({ status: 500, code: "INTERNAL", message: "boom" });
    const { unmount } = render(<CompleteObservationView cycleId="c1" scheduledId="s1" />);
    expect(screen.queryByRole("button", { name: "actions.retry" })).not.toBeInTheDocument();
    unmount();

    queries.cycle = "ok";
    render(<CompleteObservationView cycleId="c1" scheduledId="s1" />);
    expect(screen.getByRole("button", { name: "actions.retry" })).toBeInTheDocument();
  });

  it("opens the form for a visit still to be observed", () => {
    observationId.mockReturnValue(null);
    render(<CompleteObservationView cycleId="c1" scheduledId="s1" />);
    expect(screen.getByRole("form", { name: "observation form" })).toBeInTheDocument();
  });

  it("links the saved result instead of a second fill for an observed visit", () => {
    observationId.mockReturnValue("obs1");
    render(<CompleteObservationView cycleId="c1" scheduledId="s1" />);
    expect(screen.queryByRole("form", { name: "observation form" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("doneBreadcrumb");
    expect(screen.getByText("doneTitle")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "viewResult" })).toHaveAttribute(
      "href",
      "/supervision/observations/obs1",
    );
  });
});
