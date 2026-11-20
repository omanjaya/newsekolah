import type * as UiModule from "@newsekolah/ui";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DutiesView } from "./duties-view";

const assignmentsQuery = vi.fn<() => unknown>();
const mocks = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn() }));

vi.mock("next-intl", () => ({
  // A label's values stay in it, so a row's menu can be told apart.
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(", ")}` : key,
  useLocale: () => "id",
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});
vi.mock("../../../components/query-error", () => ({
  QueryError: () => <p>query error</p>,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: {
      tenant: { timezone: "Asia/Jakarta" },
      active_academic_year: { id: "year-1", label: "2026/2027" },
    },
  }),
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
  useDutyTypesQuery: () => ({
    data: { data: [{ id: "picket", name: "Guru Piket", scope_kind: "school", is_active: true }] },
  }),
  useDutyAssignmentsQuery: () => assignmentsQuery(),
  useEndDutyAssignmentMutation: () => ({ mutateAsync: mocks.remove, isPending: false }),
  useUpdateDutyAssignmentMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // isPending never turns on here, exactly like the moment between a
  // double click's two clicks, before React re-renders the button.
  useCreateDutyAssignmentMutation: () => ({ mutateAsync: mocks.create, isPending: false }),
  useStaffOptionsQuery: () => ({ data: { data: [{ id: "u1", name: "Bu Sari" }] } }),
}));
vi.mock("./end-duty-assignment-dialog", () => ({ EndDutyAssignmentDialog: () => null }));

beforeAll(() => {
  // Radix Select reads pointer-capture and scroll APIs jsdom does not implement.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function loaded(rows: unknown[]) {
  assignmentsQuery.mockReturnValue({ isLoading: false, isError: false, data: { data: rows } });
}

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
    loaded([]);
    render(<DutiesView />);
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
  });

  it("puts each row's actions in a menu named after the holder and the duty", async () => {
    loaded([
      {
        id: "a1",
        user_id: "u1",
        duty_name: "Wali kelas",
        starts_on: "2026-07-13",
        is_active: true,
      },
    ]);
    const user = userEvent.setup();
    render(<DutiesView />);

    // No bare "Akhiri" text button on the row any more.
    expect(screen.queryByRole("button", { name: "end" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "rowActions:Bu Sari, Wali kelas" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "endAction" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "reactivate" })).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: "cancelAssignment" }),
    ).not.toBeInTheDocument();
  });

  it("cancels an assignment that has not started instead of ending it before its start", async () => {
    loaded([
      {
        id: "a2",
        user_id: "u1",
        duty_name: "Guru Piket",
        starts_on: "2999-02-01",
        is_active: true,
      },
    ]);
    mocks.remove.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<DutiesView />);

    expect(screen.getByText(/^startsLater:/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "rowActions:Bu Sari, Guru Piket" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).queryByRole("menuitem", { name: "endAction" })).not.toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: "cancelAssignment" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("cancelAssignmentBody:Guru Piket")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "cancelAssignmentConfirm" }));
    expect(mocks.remove).toHaveBeenCalledWith("a2");
  });

  it("sends one assignment when Simpan is clicked twice before the form re-renders", async () => {
    loaded([]);
    let settle: () => void = () => undefined;
    mocks.create.mockReturnValue(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<DutiesView />);

    await user.click(screen.getByRole("button", { name: "assign" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: "duty" }));
    await user.click(await screen.findByRole("option", { name: "Guru Piket" }));
    await user.click(within(dialog).getByRole("button", { name: "person" }));
    await user.click(await screen.findByRole("option", { name: "Bu Sari" }));

    const save = within(dialog).getByRole("button", { name: "save" });
    // Two clicks in the same tick: nothing re-renders between them.
    act(() => {
      fireEvent.click(save);
      fireEvent.click(save);
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ duty_type_id: "picket", user_id: "u1" }),
    );
    await act(async () => {
      settle();
      await Promise.resolve();
    });
  });
});
