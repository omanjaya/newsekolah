import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ScheduleBlock } from "../api";

import { LessonCell } from "./schedule-grid-cells";

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
      canManage: false,
      crossesBreak: true,
      breakWarningLabel: "crossesBreakWarning",
    });

    expect(screen.getByRole("img", { name: "crossesBreakWarning" })).toBeInTheDocument();
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
});
