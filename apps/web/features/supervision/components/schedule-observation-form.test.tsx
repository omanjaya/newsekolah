import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ schedules: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/hooks/use-active-year", () => ({
  useActiveYear: () => ({ id: "year-1", label: "2026/2027" }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [] } }),
  useSubjectsQuery: () => ({ data: { data: [] } }),
  useLookup: () => new Map(),
}));
vi.mock("../../schedule/api", () => ({ useSchedulesQuery: mocks.schedules }));
vi.mock("../api", () => ({
  useScheduleObservationMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { ScheduleObservationForm } from "./schedule-observation-form";

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
  mocks.schedules.mockReturnValue({ data: { data: [] } });
});

describe("ScheduleObservationForm teacher picker", () => {
  it("loads lesson blocks only for the teacher found by search", async () => {
    const user = userEvent.setup();
    render(<ScheduleObservationForm cycleId="cycle-1" onDone={vi.fn()} />);

    const picker = screen.getByRole("combobox", { name: "teacherPlaceholder" });
    expect(picker).toHaveAttribute("data-kind", "teacher");
    expect(mocks.schedules).toHaveBeenLastCalledWith(
      expect.objectContaining({ academicYearId: "year-1", teacherUserId: "" }),
    );

    await user.click(picker);

    expect(mocks.schedules).toHaveBeenLastCalledWith(
      expect.objectContaining({ academicYearId: "year-1", teacherUserId: "picked-1" }),
    );
  });
});
