import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DutiesView } from "./duties-view";

const assignmentsQuery = vi.fn<() => unknown>();

vi.mock("next-intl", () => ({
  // A label's values stay in it, so a row's menu can be told apart.
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(", ")}` : key,
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
  return directoryNamesStub([{ id: "u1", name: "Bu Sari" }]);
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

  it("puts each row's actions in a menu named after the holder and the duty", async () => {
    const row = {
      id: "a1",
      user_id: "u1",
      duty_name: "Wali kelas",
      starts_on: "2026-07-13",
      is_active: true,
    };
    assignmentsQuery.mockReturnValue({ isLoading: false, isError: false, data: { data: [row] } });
    const user = userEvent.setup();
    render(<DutiesView />);

    // No bare "Akhiri" text button on the row any more.
    expect(screen.queryByRole("button", { name: "end" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "rowActions:Bu Sari, Wali kelas" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "endAction" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "reactivate" })).not.toBeInTheDocument();
  });
});
