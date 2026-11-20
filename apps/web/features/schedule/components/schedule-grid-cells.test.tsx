import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ScheduleBlock } from "../api";

import { LessonCell } from "./schedule-grid-cells";

// LessonSubstitutionAction's own permission/session wiring is covered by
// lesson-substitution-action.test.tsx; this file only cares that LessonCell
// renders it, not what it renders as.
vi.mock("./lesson-substitution-action", () => ({ LessonSubstitutionAction: () => null }));

const t = (key: string) => key;

function block(overrides: Partial<ScheduleBlock> = {}): ScheduleBlock {
  return {
    schedule_ids: ["schedule-1"],
    class_id: "class-1",
    subject_id: "subject-1",
    teacher_user_id: "teacher-1",
    day_of_week: 1,
    start_seq: 1,
    end_seq: 1,
    source: "admin",
    effective_from: "2026-07-13",
    ...overrides,
  };
}

/** `LessonCell` is a `<td>`; a table wrapper keeps the markup valid so
 * Testing Library's render matches how it actually mounts in the grid. */
function renderCell(
  props: Omit<Parameters<typeof LessonCell>[0], "t" | "onCopy" | "onEdit" | "onDelete"> &
    Partial<Pick<Parameters<typeof LessonCell>[0], "onCopy" | "onEdit" | "onDelete">>,
) {
  return render(
    <table>
      <tbody>
        <tr>
          <LessonCell
            {...props}
            onCopy={props.onCopy ?? vi.fn()}
            onEdit={props.onEdit ?? vi.fn()}
            onDelete={props.onDelete ?? vi.fn()}
            t={t}
          />
        </tr>
      </tbody>
    </table>,
  );
}

describe("LessonCell", () => {
  it("shows the subject and detail text", () => {
    renderCell({
      block: block(),
      span: 1,
      subject: "Matematika",
      detail: "Budi",
      canManage: false,
    });

    expect(screen.getByText("Matematika")).toBeInTheDocument();
    expect(screen.getByText("Budi")).toBeInTheDocument();
  });

  it("does not show the break-crossing warning when the block does not cross a break", () => {
    renderCell({
      block: block(),
      span: 1,
      subject: "Matematika",
      detail: "Budi",
      canManage: false,
      crossesBreak: false,
      breakWarningLabel: "crossesBreakWarning",
    });

    expect(screen.queryByRole("img", { name: "crossesBreakWarning" })).not.toBeInTheDocument();
  });

  it("shows the break-crossing warning only when the block actually crosses a break", () => {
    renderCell({
      block: block(),
      span: 1,
      subject: "Matematika",
      detail: "Budi",
      canManage: true,
      crossesBreak: true,
      breakWarningLabel: "crossesBreakWarning",
    });

    expect(screen.getByRole("img", { name: "crossesBreakWarning" })).toBeInTheDocument();
  });

  it("keeps the break-crossing warning from readers who cannot edit the timetable", () => {
    renderCell({
      block: block(),
      span: 1,
      subject: "Matematika",
      detail: "Budi",
      canManage: false,
      crossesBreak: true,
      breakWarningLabel: "crossesBreakWarning",
    });

    expect(screen.queryByRole("img", { name: "crossesBreakWarning" })).not.toBeInTheDocument();
  });

  it("paints the same subject id with the same soft-category tone every render", () => {
    const { container: first } = renderCell({
      block: block({ subject_id: "subject-42" }),
      span: 1,
      subject: "Biologi",
      detail: "Sari",
      canManage: false,
    });
    const { container: second } = renderCell({
      block: block({ subject_id: "subject-42" }),
      span: 1,
      subject: "Biologi",
      detail: "Sari",
      canManage: false,
    });

    const toneClassOf = (container: HTMLElement) =>
      Array.from(container.querySelectorAll("div"))
        .find((el) => el.className.includes("bg-category-"))
        ?.className.match(/bg-category-\w+-soft/)?.[0];

    expect(toneClassOf(first)).toBeDefined();
    expect(toneClassOf(first)).toBe(toneClassOf(second));
  });

  it("only renders the manage actions when canManage is true", () => {
    renderCell({
      block: block(),
      span: 1,
      subject: "Matematika",
      detail: "Budi",
      canManage: false,
    });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders copy, edit and delete actions when canManage is true", () => {
    renderCell({
      block: block(),
      span: 1,
      subject: "Matematika",
      detail: "Budi",
      canManage: true,
    });
    expect(screen.getByRole("button", { name: "copyBlock" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "editBlock" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "deleteBlock" })).toBeInTheDocument();
  });

  it("keeps edit and delete open on a block with history: the change takes a date instead", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    renderCell({
      block: block({
        has_history: true,
        mutation_policy: {
          can_edit: true,
          can_delete: true,
          has_history: true,
          requires_effective_from: true,
          min_effective_from: "2026-11-23",
        },
      }),
      span: 1,
      subject: "Matematika",
      detail: "Budi",
      canManage: true,
      onEdit,
      onDelete,
    });
    const edit = screen.getByRole("button", { name: "editBlock" });
    expect(edit).not.toHaveAttribute("aria-disabled");
    edit.click();
    screen.getByRole("button", { name: "deleteBlock" }).click();
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("locks edit and delete on a block that has ended and says why", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    renderCell({
      block: block({
        has_history: true,
        effective_until: "2026-11-16",
        mutation_policy: {
          can_edit: false,
          can_delete: false,
          has_history: true,
          reason: "SCHEDULE_ENDED",
        },
      }),
      span: 1,
      subject: "Matematika",
      detail: "Budi",
      canManage: true,
      onEdit,
      onDelete,
    });
    const edit = screen.getByRole("button", { name: "editBlock" });
    const remove = screen.getByRole("button", { name: "deleteBlock" });
    expect(edit).toHaveAccessibleDescription("blockEnded");
    expect(remove).toHaveAccessibleDescription("blockEnded");
    expect(edit).toHaveAttribute("aria-disabled", "true");
    expect(remove).toHaveAttribute("aria-disabled", "true");
    edit.click();
    remove.click();
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    // Copying an ended lesson to another slot is still allowed.
    expect(screen.getByRole("button", { name: "copyBlock" })).not.toHaveAttribute("aria-disabled");
  });

  it("says a block still running is locked because its remaining lessons all have history", () => {
    renderCell({
      block: block({
        has_history: true,
        effective_until: "2026-11-26",
        mutation_policy: {
          can_edit: false,
          can_delete: false,
          has_history: true,
          reason: "SCHEDULE_CHANGE_BEFORE_HISTORY",
        },
      }),
      span: 1,
      subject: "Matematika",
      detail: "Budi",
      canManage: true,
    });
    expect(screen.getByRole("button", { name: "editBlock" })).toHaveAccessibleDescription(
      "blockBoundByHistory",
    );
    expect(screen.getByRole("button", { name: "deleteBlock" })).toHaveAccessibleDescription(
      "blockBoundByHistory",
    );
  });

  it("says when a block starts or ends within the week shown", () => {
    renderCell({
      block: block(),
      span: 1,
      subject: "Matematika",
      detail: "Budi",
      canManage: false,
      caption: "Mulai Kam, 3 Des",
    });
    expect(screen.getByText("Mulai Kam, 3 Des")).toBeInTheDocument();
  });
});
