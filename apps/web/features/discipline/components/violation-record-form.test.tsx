import type * as UiModule from "@newsekolah/ui";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  record: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  const people = [
    { id: "s1", name: "Sari" },
    { id: "s2", name: "Budi" },
  ];
  return { ...directoryNamesStub(people), useDirectorySearch: mocks.search };
});
vi.mock("../api", () => ({
  useRecordViolationMutation: () => ({ mutateAsync: mocks.record, isPending: false }),
  useViolationTypesQuery: () => ({
    data: { data: [{ id: "type-1", name: "Terlambat", points: 5, is_active: true }] },
  }),
}));
vi.mock("../api-violation-extras", () => ({
  usePointsPreviewQuery: () => ({ data: undefined }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { ViolationRecordForm } from "./violation-record-form";

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
    data: [
      { id: "s1", name: "Sari", username: "sari" },
      { id: "s2", name: "Budi", username: "budi" },
    ],
    isFetching: false,
  });
  mocks.record.mockResolvedValue({ record: { student_user_id: "s1" }, due_levels: [] });
});

describe("ViolationRecordForm student search", () => {
  it("asks the server for a short page of students instead of filtering a loaded roster", () => {
    render(<ViolationRecordForm onDone={vi.fn()} />);

    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({ profileKind: "student", query: "", limit: 30 }),
    );
    expect(screen.getByText("Sari")).toBeInTheDocument();
    expect(screen.getByText("Budi")).toBeInTheDocument();
  });

  it("searches after typing, then records the picked students one by one", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ViolationRecordForm onDone={onDone} />);

    await user.type(screen.getByRole("textbox", { name: "studentSearchPlaceholder" }), "sar");
    await waitFor(() => {
      expect(mocks.search).toHaveBeenLastCalledWith(expect.objectContaining({ query: "sar" }));
    });

    await user.click(screen.getAllByRole("checkbox").at(0) ?? document.body);
    expect(screen.getByRole("button", { name: /Sari/ })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Terlambat/ }));
    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => {
      expect(mocks.record).toHaveBeenCalledWith(
        expect.objectContaining({ student_user_id: "s1", violation_type_ids: ["type-1"] }),
      );
    });
    expect(onDone).toHaveBeenCalled();
  });
});
