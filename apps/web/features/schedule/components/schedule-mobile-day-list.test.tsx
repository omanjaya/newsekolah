import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ScheduleBlock } from "../api";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
}));
vi.mock("./lesson-substitution-action", () => ({ LessonSubstitutionAction: () => null }));

import { lockableBlockActions } from "./lockable-block-actions";
import { ScheduleMobileDayList } from "./schedule-mobile-day-list";

const periods = [
  { id: "p1", name: "Jam 1", sequence: 1, starts_at: "07:00:00", ends_at: "07:45:00" },
  { id: "p2", name: "Jam 2", sequence: 2, starts_at: "07:45:00", ends_at: "08:30:00" },
  { id: "p3", name: "Jam 3", sequence: 3, starts_at: "08:30:00", ends_at: "09:15:00" },
].map((period) => ({ ...period, is_break: false }));

function renderDay(block: ScheduleBlock) {
  const blocks = new Map<string, ScheduleBlock>();
  for (let seq = block.start_seq; seq <= block.end_seq; seq++) {
    blocks.set(`${block.class_id}:${String(seq)}`, block);
  }
  render(
    <ScheduleMobileDayList
      classes={[{ id: "class-1", name: "X-A" }]}
      lessonPeriods={periods}
      blocks={blocks}
      teacherMap={new Map([["t1", { id: "t1", name: "Guru Contoh" }]])}
      subjectMap={new Map([["s1", { id: "s1", name: "Matematika" }]])}
      canManage={false}
      copied={null}
      onAdd={vi.fn()}
      onPaste={vi.fn()}
      onCopy={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      t={(key) => key}
    />,
  );
}

describe("ScheduleMobileDayList", () => {
  it("names a multi-period lesson by its first and last period, with its whole time span", () => {
    renderDay({
      schedule_ids: ["a"],
      class_id: "class-1",
      subject_id: "s1",
      teacher_user_id: "t1",
      day_of_week: 1,
      start_seq: 1,
      end_seq: 2,
    } as ScheduleBlock);

    const lesson = screen.getByText("Matematika").closest("li");
    expect(lesson).toHaveTextContent("Guru Contoh · Jam 1 – Jam 2");
    // From the first period's start to the last period's end.
    expect(lesson).toHaveTextContent("07.00");
    expect(lesson).toHaveTextContent("08.30");
    // The period it covers is not offered again as a free slot.
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("names a one-period lesson by that period alone", () => {
    renderDay({
      schedule_ids: ["b"],
      class_id: "class-1",
      subject_id: "s1",
      teacher_user_id: "t1",
      day_of_week: 1,
      start_seq: 3,
      end_seq: 3,
    } as ScheduleBlock);

    expect(screen.getByText("Matematika").closest("li")).toHaveTextContent("Guru Contoh · Jam 3");
  });
});

describe("lockableBlockActions", () => {
  const lesson = {
    schedule_ids: ["c"],
    class_id: "class-1",
    subject_id: "s1",
    teacher_user_id: "t1",
    day_of_week: 1,
    start_seq: 1,
    end_seq: 1,
    source: "admin",
  } as ScheduleBlock;

  it("offers edit and delete on a lesson without history", () => {
    const items = lockableBlockActions(lesson, (key) => key, {
      onEdit: vi.fn(),
      onDelete: vi.fn(),
    });
    expect(items.map((item) => [item.label, item.disabled])).toEqual([
      ["editBlock", false],
      ["deleteBlock", false],
    ]);
  });

  it("disables both, saying why, on a lesson with attendance history", () => {
    const items = lockableBlockActions({ ...lesson, has_history: true }, (key) => key, {
      onEdit: vi.fn(),
      onDelete: vi.fn(),
    });
    expect(items.map((item) => [item.label, item.disabled])).toEqual([
      ["editBlockLocked", true],
      ["deleteBlockLocked", true],
    ]);
  });
});
