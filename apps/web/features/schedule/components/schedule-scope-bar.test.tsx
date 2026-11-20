import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});

import { nearestSchoolDay, stepSchoolDay } from "../week";

import { ScheduleScopeBar } from "./schedule-scope-bar";

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

function renderBar(overrides: Partial<Parameters<typeof ScheduleScopeBar>[0]> = {}) {
  const onTeacherChange = vi.fn();
  render(
    <ScheduleScopeBar
      mode="teacher"
      onModeChange={vi.fn()}
      isStudent={false}
      ownTimetableOnly={false}
      canViewAll
      dates={{
        weekOf: "2026-11-16",
        onWeekOfChange: vi.fn(),
        dayDate: "2026-11-20",
        onDayDateChange: vi.fn(),
        today: "2026-11-20",
        weekLabel: "16–22 Nov 2026",
      }}
      classOptions={[]}
      classId=""
      onClassChange={vi.fn()}
      teacherId="teacher-2"
      onTeacherChange={onTeacherChange}
      {...overrides}
    />,
  );
  return onTeacherChange;
}

describe("ScheduleScopeBar teacher picker", () => {
  it("searches teachers on the server and shows the current one", async () => {
    const user = userEvent.setup();
    const onTeacherChange = renderBar();

    const picker = screen.getByRole("combobox", { name: "pickTeacher" });
    expect(picker).toHaveAttribute("data-kind", "teacher");
    expect(picker).toHaveAttribute("data-value", "teacher-2");
    await user.click(picker);

    expect(onTeacherChange).toHaveBeenCalledWith("picked-1", "Picked Person");
  });

  it("gives a teacher without school-wide access no picker", () => {
    renderBar({ canViewAll: false, ownTimetableOnly: true });

    expect(screen.queryByRole("combobox", { name: "pickTeacher" })).toBeNull();
  });
});

describe("ScheduleScopeBar dates", () => {
  it("steps the class and teacher views a week at a time", async () => {
    const user = userEvent.setup();
    const onWeekOfChange = vi.fn();
    render(
      <ScheduleScopeBar
        mode="class"
        onModeChange={vi.fn()}
        isStudent={false}
        ownTimetableOnly={false}
        canViewAll
        dates={{
          weekOf: "2026-11-16",
          onWeekOfChange,
          dayDate: "2026-11-20",
          onDayDateChange: vi.fn(),
          today: "2026-11-20",
          weekLabel: "16–22 Nov 2026",
        }}
        classOptions={[]}
        classId=""
        onClassChange={vi.fn()}
        teacherId=""
        onTeacherChange={vi.fn()}
      />,
    );

    // The picker shows the Monday; the range it stands for describes it.
    expect(screen.getByRole("combobox", { name: "pickWeek" })).toHaveAccessibleDescription(
      "weekLabel",
    );
    await user.click(screen.getByRole("button", { name: "nextWeek" }));
    expect(onWeekOfChange).toHaveBeenCalledWith("2026-11-23");
    await user.click(screen.getByRole("button", { name: "previousWeek" }));
    expect(onWeekOfChange).toHaveBeenCalledWith("2026-11-09");
    // The current week needs no way back to itself.
    expect(screen.queryByRole("button", { name: "thisWeek" })).toBeNull();
  });

  it("steps the day view a date at a time", async () => {
    const user = userEvent.setup();
    const onDayDateChange = vi.fn();
    render(
      <ScheduleScopeBar
        mode="day"
        onModeChange={vi.fn()}
        isStudent={false}
        ownTimetableOnly={false}
        canViewAll
        dates={{
          weekOf: "2026-11-16",
          onWeekOfChange: vi.fn(),
          dayDate: "2026-11-23",
          onDayDateChange,
          today: "2026-11-20",
          weekLabel: "16–22 Nov 2026",
        }}
        classOptions={[]}
        classId=""
        onClassChange={vi.fn()}
        teacherId=""
        onTeacherChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "nextDay" }));
    expect(onDayDateChange).toHaveBeenCalledWith("2026-11-24");
    await user.click(screen.getByRole("button", { name: "today" }));
    expect(onDayDateChange).toHaveBeenCalledWith("2026-11-20");
  });

  it("steps the day view over the days the school is closed", async () => {
    const user = userEvent.setup();
    const onDayDateChange = vi.fn();
    const weekdays = [1, 2, 3, 4, 5];
    render(
      <ScheduleScopeBar
        mode="day"
        onModeChange={vi.fn()}
        isStudent={false}
        ownTimetableOnly={false}
        canViewAll
        dates={{
          weekOf: "2026-11-16",
          onWeekOfChange: vi.fn(),
          dayDate: "2026-11-20",
          onDayDateChange,
          // A Saturday: "today" leads to the next school day.
          today: "2026-11-21",
          weekLabel: "16–22 Nov 2026",
          stepDay: (date, direction) => stepSchoolDay(date, direction, weekdays),
          normalizeDay: (date) => nearestSchoolDay(date, weekdays),
        }}
        classOptions={[]}
        classId=""
        onClassChange={vi.fn()}
        teacherId=""
        onTeacherChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "nextDay" }));
    expect(onDayDateChange).toHaveBeenLastCalledWith("2026-11-23");
    await user.click(screen.getByRole("button", { name: "previousDay" }));
    expect(onDayDateChange).toHaveBeenLastCalledWith("2026-11-19");
    await user.click(screen.getByRole("button", { name: "today" }));
    expect(onDayDateChange).toHaveBeenLastCalledWith("2026-11-23");
  });
});
