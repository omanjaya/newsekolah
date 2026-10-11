import type * as UiModule from "@newsekolah/ui";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ search: vi.fn(), recordLate: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/api", () => ({
  usePeriodsQuery: () => ({ data: { data: [] }, isLoading: false }),
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return {
    ...directoryNamesStub([{ id: "s1", name: "Sari" }]),
    useDirectorySearch: mocks.search,
  };
});
vi.mock("../api", () => ({
  useRecordExitPermitByStaffMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRecordLateArrivalByStaffMutation: () => ({
    mutateAsync: mocks.recordLate,
    isPending: false,
  }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { DutyManualRecordPanel } from "./duty-manual-record-panel";

beforeAll(() => {
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.search.mockReturnValue({
    data: [{ id: "s1", name: "Sari", username: "sari" }],
    isFetching: false,
  });
});

describe("DutyManualRecordPanel student search", () => {
  it("lists a short server page of students and narrows it by the typed query", async () => {
    const user = userEvent.setup();
    render(<DutyManualRecordPanel />);

    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({ profileKind: "student", query: "", limit: 30 }),
    );
    expect(screen.getByRole("button", { name: /Sari/ })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "studentSearchPlaceholder" }), "sar");
    await waitFor(() => {
      expect(mocks.search).toHaveBeenLastCalledWith(expect.objectContaining({ query: "sar" }));
    });
  });

  it("shows the chosen student by name from the lookup", async () => {
    const user = userEvent.setup();
    render(<DutyManualRecordPanel />);

    await user.click(screen.getByRole("button", { name: /Sari/ }));

    expect(screen.getAllByText("Sari").length).toBeGreaterThan(0);
  });
});
