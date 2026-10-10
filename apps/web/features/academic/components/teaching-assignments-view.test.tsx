import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ assignmentsFor: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/hooks/use-active-year", () => ({
  useActiveYear: () => ({ id: "year-1", label: "2026/2027" }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([{ id: "picked-1", name: "Budi" }]);
});
vi.mock("../../reference/api", () => ({
  useSubjectsQuery: () => ({ data: { data: [] } }),
  useLookup: () => new Map(),
}));
vi.mock("../api", () => ({
  useAcademicYearsQuery: () => ({ data: { data: [{ id: "year-1", label: "2026/2027" }] } }),
}));
vi.mock("../api-offerings", () => ({
  useClassesForYearQuery: () => ({ data: { data: [] } }),
  useSyncTeacherAssignmentsMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useTeachingAssignmentsForTeacherQuery: mocks.assignmentsFor,
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { TeachingAssignmentsView } from "./teaching-assignments-view";

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
  mocks.assignmentsFor.mockReturnValue({ data: { data: [] }, isLoading: false });
});

describe("TeachingAssignmentsView teacher picker", () => {
  it("shows the empty state until a teacher is found by search and picked", async () => {
    const user = userEvent.setup();
    render(<TeachingAssignmentsView />);

    const picker = screen.getByRole("combobox", { name: "pickTeacher" });
    expect(picker).toHaveAttribute("data-kind", "teacher");
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();

    await user.click(picker);

    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
    expect(mocks.assignmentsFor).toHaveBeenLastCalledWith("year-1", "picked-1");
  });
});
