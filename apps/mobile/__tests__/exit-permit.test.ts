import {
  endLessons,
  exitReturnState,
  lessonEnded,
  schoolClock,
  upcomingLessons,
} from "@/lib/permits/exit-permit";

const periods = [
  { id: "p1", ends_at: "07:45:00", is_break: false },
  { id: "b1", ends_at: "08:00:00", is_break: true },
  { id: "p2", ends_at: "08:45:00", is_break: false },
  { id: "p3", ends_at: "09:30:00", is_break: false },
];

describe("schoolClock", () => {
  it("reads the time of day in the school's time zone", () => {
    expect(schoolClock(new Date("2027-02-16T01:05:00Z"), "Asia/Jakarta")).toBe("08:05");
    expect(schoolClock(new Date("2027-02-16T01:05:00Z"), "Asia/Makassar")).toBe("09:05");
  });
});

describe("upcomingLessons", () => {
  it("offers only the lessons not over yet, without breaks", () => {
    expect(upcomingLessons(periods, "08:10").map((p) => p.id)).toEqual(["p2", "p3"]);
    expect(upcomingLessons(periods, "07:45").map((p) => p.id)).toEqual(["p2", "p3"]);
    expect(upcomingLessons(periods, "11:00")).toEqual([]);
  });

  it("drops a lesson at the minute it ends, as the API does", () => {
    expect(lessonEnded({ ends_at: "08:45:00" }, "08:44")).toBe(false);
    expect(lessonEnded({ ends_at: "08:45:00" }, "08:45")).toBe(true);
  });
});

describe("endLessons", () => {
  it("offers the start lesson and every one after it", () => {
    const lessons = upcomingLessons(periods, "07:00");
    expect(endLessons(lessons, "p2").map((p) => p.id)).toEqual(["p2", "p3"]);
    expect(endLessons(lessons, "").map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });
});

describe("exitReturnState", () => {
  const due = "2027-02-16T04:00:00Z";
  const out = { exited_at: "2027-02-16T02:15:00Z", return_required: true, expected_return_at: due };

  it("is out, then late once the due time has passed", () => {
    expect(exitReturnState(out, new Date("2027-02-16T03:30:00Z"))).toEqual({
      kind: "out",
      due,
      lateMinutes: 0,
    });
    expect(exitReturnState(out, new Date("2027-02-16T04:30:00Z"))).toMatchObject({
      lateMinutes: 30,
    });
  });

  it("is returned, late by the minutes past the due time", () => {
    expect(exitReturnState({ ...out, returned_at: "2027-02-16T04:20:00Z" }, new Date())).toEqual({
      kind: "returned",
      at: "2027-02-16T04:20:00Z",
      lateMinutes: 20,
    });
  });

  it("does not judge a return with no due time", () => {
    const imported = { exited_at: out.exited_at, return_required: true, returned_at: due };
    expect(exitReturnState(imported, new Date())).toEqual({
      kind: "returned",
      at: due,
      lateMinutes: null,
    });
  });

  it("says nothing for a permit that exited before returns were tracked", () => {
    expect(
      exitReturnState({ exited_at: out.exited_at, return_required: true }, new Date()),
    ).toEqual({ kind: "none" });
  });

  it("tells a student who went home apart from one not through the gate", () => {
    expect(exitReturnState({ ...out, return_required: false }, new Date())).toEqual({
      kind: "no_return",
    });
    expect(exitReturnState({ return_required: true }, new Date())).toEqual({ kind: "none" });
  });
});
