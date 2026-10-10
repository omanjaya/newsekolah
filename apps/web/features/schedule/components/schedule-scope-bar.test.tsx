import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});

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
      activeDays={[1, 2, 3, 4, 5]}
      dayFilter={1}
      onDayFilterChange={vi.fn()}
      classOptions={[]}
      classId=""
      className=""
      onClassChange={vi.fn()}
      teacherId="teacher-2"
      onTeacherChange={onTeacherChange}
      yearLabel="2026/2027"
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
