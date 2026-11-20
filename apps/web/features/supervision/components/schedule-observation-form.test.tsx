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
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
  useCan: () => true,
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
// Friday 20 November 2026.
vi.mock("../../../lib/tenant-date", () => ({ todayInZone: () => "2026-11-20" }));
vi.mock("../api", () => ({
  useScheduleObservationMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { ScheduleObservationForm } from "./schedule-observation-form";

beforeAll(() => {
  // Radix Select probes pointer capture and scrolls the active option into view.
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

describe("ScheduleObservationForm lesson choice", () => {
  const block = (id: string, day: number) => ({
    schedule_ids: [id],
    day_of_week: day,
    class_id: "class-1",
    subject_id: "subject-1",
  });

  it("offers only the teacher's lessons on the visit date's weekday", async () => {
    // A Monday lesson could be scheduled on a Friday, and the report then
    // carried the wrong lesson.
    mocks.schedules.mockReturnValue({ data: { data: [block("monday", 1), block("friday", 5)] } });
    const user = userEvent.setup();
    render(<ScheduleObservationForm cycleId="cycle-1" onDone={vi.fn()} />);
    await user.click(screen.getByRole("combobox", { name: "teacherPlaceholder" }));

    await user.click(screen.getByRole("combobox", { name: "lesson" }));
    expect(await screen.findByRole("option", { name: "5" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "1" })).not.toBeInTheDocument();
  });

  it("says when the teacher has no lesson on that weekday", async () => {
    mocks.schedules.mockReturnValue({ data: { data: [block("monday", 1)] } });
    const user = userEvent.setup();
    render(<ScheduleObservationForm cycleId="cycle-1" onDone={vi.fn()} />);
    await user.click(screen.getByRole("combobox", { name: "teacherPlaceholder" }));

    expect(screen.getByText("noLessonOnDay")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "lesson" })).toBeDisabled();
  });
});
