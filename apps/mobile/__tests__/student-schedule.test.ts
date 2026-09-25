import { buildScheduleRows, isoDayOfWeek, pickNextLesson } from "@/lib/home/schedule";
import type { Period, ScheduleBlock } from "@/lib/api/hooks";

function period(sequence: number, starts_at: string, ends_at: string): Period {
  return {
    id: `period-${String(sequence)}`,
    template_id: "template-1",
    name: `Jam ke-${String(sequence)}`,
    sequence,
    starts_at,
    ends_at,
    is_break: false,
  };
}

function block(overrides: Partial<ScheduleBlock> = {}): ScheduleBlock {
  return {
    schedule_ids: ["sched-1"],
    class_id: "class-1",
    subject_id: "subject-math",
    teacher_user_id: "teacher-1",
    room_id: "room-1",
    day_of_week: 4,
    start_seq: 1,
    end_seq: 1,
    source: "admin",
    ...overrides,
  };
}

const PERIODS: Period[] = [
  period(1, "08:40", "10:00"),
  period(2, "10:15", "11:00"),
  period(3, "12:30", "13:15"),
];

const NAMES = new Map([
  ["subject-math", "Matematika"],
  ["subject-indo", "Bahasa Indonesia"],
]);
const ROOMS = new Map([["room-1", "Ruang X-A"]]);
const TEACHERS = new Map([["teacher-1", "Bu Rina"]]);

describe("isoDayOfWeek", () => {
  it("maps Sunday (JS 0) to 7", () => {
    expect(isoDayOfWeek(new Date("2026-09-27T09:00:00"))).toBe(7);
  });

  it("maps Thursday (JS 4) to 4", () => {
    expect(isoDayOfWeek(new Date("2026-09-24T09:00:00"))).toBe(4);
  });
});

describe("buildScheduleRows", () => {
  it("joins a block to its period times and reference names, sorted by start_seq", () => {
    const today = new Date("2026-09-24T07:00:00");
    const rows = buildScheduleRows(
      [
        block({ start_seq: 2, end_seq: 2, subject_id: "subject-indo", schedule_ids: ["s2"] }),
        block({ start_seq: 1, end_seq: 1, schedule_ids: ["s1"] }),
      ],
      PERIODS,
      today,
      NAMES,
      ROOMS,
      TEACHERS,
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.subjectName).toBe("Matematika");
    expect(rows[0]?.startLabel).toBe("08.40");
    expect(rows[0]?.endLabel).toBe("10.00");
    expect(rows[0]?.roomName).toBe("Ruang X-A");
    expect(rows[0]?.teacherName).toBe("Bu Rina");
    expect(rows[1]?.subjectName).toBe("Bahasa Indonesia");
  });

  it("drops a block whose period sequence has no match rather than guessing a time", () => {
    const today = new Date("2026-09-24T07:00:00");
    const rows = buildScheduleRows(
      [block({ start_seq: 99, end_seq: 99 })],
      PERIODS,
      today,
      NAMES,
      ROOMS,
      TEACHERS,
    );
    expect(rows).toHaveLength(0);
  });

  it("falls back to '-' for an unresolved subject name and null for an unresolved room", () => {
    const today = new Date("2026-09-24T07:00:00");
    const rows = buildScheduleRows(
      [block({ subject_id: "unknown-subject", room_id: undefined })],
      PERIODS,
      today,
      NAMES,
      ROOMS,
      TEACHERS,
    );
    expect(rows[0]?.subjectName).toBe("-");
    expect(rows[0]?.roomName).toBeNull();
  });
});

describe("pickNextLesson", () => {
  const today = new Date("2026-09-24T07:00:00");
  const rows = buildScheduleRows(
    [
      block({ start_seq: 1, end_seq: 1, schedule_ids: ["s1"] }),
      block({ start_seq: 2, end_seq: 2, subject_id: "subject-indo", schedule_ids: ["s2"] }),
    ],
    PERIODS,
    today,
    NAMES,
    ROOMS,
    TEACHERS,
  );

  it("returns the first lesson with a positive countdown when nothing has started", () => {
    const now = new Date("2026-09-24T08:28:00");
    const next = pickNextLesson(rows, now);
    expect(next?.row.subjectName).toBe("Matematika");
    expect(next?.inProgress).toBe(false);
    expect(next?.minutesUntilStart).toBe(12);
  });

  it("marks the lesson in progress once its start time has passed", () => {
    const now = new Date("2026-09-24T09:00:00");
    const next = pickNextLesson(rows, now);
    expect(next?.row.subjectName).toBe("Matematika");
    expect(next?.inProgress).toBe(true);
  });

  it("moves on to the next block once the current one has ended", () => {
    const now = new Date("2026-09-24T10:05:00");
    const next = pickNextLesson(rows, now);
    expect(next?.row.subjectName).toBe("Bahasa Indonesia");
  });

  it("returns null once every lesson for the day is over", () => {
    const now = new Date("2026-09-24T18:00:00");
    expect(pickNextLesson(rows, now)).toBeNull();
  });

  it("returns null for an empty schedule instead of inventing a lesson", () => {
    expect(pickNextLesson([], new Date("2026-09-24T08:00:00"))).toBeNull();
  });
});
