import { ApiError } from "@newsekolah/api-client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ObservationDetailView } from "./observation-detail-view";

const state = vi.hoisted<{ error: unknown; canViewAll: boolean; refetch: () => void }>(() => ({
  error: null,
  canViewAll: false,
  refetch: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { id: "t1" } }),
  useCan: (permission: string) => permission === "view_supervision" && state.canViewAll,
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([]);
});
vi.mock("../lib/use-lesson-context", () => ({ useLessonContext: () => ({}) }));
vi.mock("../api", () => ({
  useObservationQuery: () => ({
    data: undefined,
    isLoading: false,
    isError: true,
    error: state.error,
    refetch: state.refetch,
  }),
  useSupervisionCycleQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useScheduledObservationsForTeacherQuery: () => ({ data: undefined }),
  useRespondToObservationMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

afterEach(() => {
  cleanup();
  state.canViewAll = false;
});

describe("ObservationDetailView", () => {
  it("shows the not-found state for an unknown observation, with a way back", () => {
    state.error = new ApiError({
      status: 404,
      code: "SUPERVISION_OBSERVATION_NOT_FOUND",
      message: "not found",
    });
    render(<ObservationDetailView observationId="00000000-0000-0000-0000-000000000001" />);

    expect(screen.getByText("notFoundTitle")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "actions.retry" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backToMyReport" })).toHaveAttribute(
      "href",
      "/supervision/my-report",
    );
  });

  it("treats a malformed id as not found and leads a supervisor to the cycles", () => {
    state.canViewAll = true;
    state.error = new ApiError({
      status: 400,
      code: "VALIDATION_FAILED",
      message: "invalid",
      details: [{ field: "observationId", code: "INVALID_FORMAT" }],
    });
    render(<ObservationDetailView observationId="abc" />);

    expect(screen.getByText("notFoundTitle")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backToCycles" })).toHaveAttribute(
      "href",
      "/supervision/cycles",
    );
  });

  it("keeps the retryable load failure for other errors", () => {
    state.error = new ApiError({ status: 500, code: "INTERNAL", message: "boom" });
    render(<ObservationDetailView observationId="obs1" />);

    expect(screen.queryByText("notFoundTitle")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "actions.retry" })).toBeInTheDocument();
  });
});
