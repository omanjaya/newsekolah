import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DutiesView } from "./duties-view";

const assignmentsQuery = vi.fn<() => unknown>();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../components/query-error", () => ({
  QueryError: () => <p>query error</p>,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [] } }),
  useLookup: () => new Map(),
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([]);
});
vi.mock("../duties-api", () => ({
  useDutyTypesQuery: () => ({ data: { data: [] } }),
  useDutyAssignmentsQuery: () => assignmentsQuery(),
  useEndDutyAssignmentMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateDutyAssignmentMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateDutyAssignmentMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useStaffOptionsQuery: () => ({ data: [] }),
}));
vi.mock("./end-duty-assignment-dialog", () => ({ EndDutyAssignmentDialog: () => null }));

afterEach(cleanup);

describe("DutiesView", () => {
  it("shows a load error with a retry instead of saying no duties exist", () => {
    assignmentsQuery.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error("boom"),
      data: undefined,
      refetch: vi.fn(),
    });
    render(<DutiesView />);
    expect(screen.getByText("query error")).toBeInTheDocument();
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });

  it("keeps the empty state when the list loaded empty", () => {
    assignmentsQuery.mockReturnValue({ isLoading: false, isError: false, data: { data: [] } });
    render(<DutiesView />);
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
  });
});
