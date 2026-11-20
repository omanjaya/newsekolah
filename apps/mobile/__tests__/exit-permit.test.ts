import {
  endLessons,
  exitReturnState,
  isTodaysPermit,
  lessonEnded,
  permitLessonsOver,
  schoolClock,
  schoolDay,
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

describe("schoolDay", () => {
  it("reads the calendar day in the school's time zone", () => {
    // 17:30 UTC is already the next morning in Jakarta.
    expect(schoolDay("2027-02-15T17:30:00Z", "Asia/Jakarta")).toBe("2027-02-16");
    expect(schoolDay(new Date("2027-02-15T16:30:00Z"), "Asia/Jakarta")).toBe("2027-02-15");
  });
});

describe("isTodaysPermit", () => {
  const tz = "Asia/Jakarta";
  const now = new Date("2027-02-16T06:00:00Z"); // 13:00 in Jakarta
  const opened = "2027-02-16T00:10:00Z"; // 07:10 the same day

  it("holds the day for a permit on its way, approved, or through the gate", () => {
    for (const status of ["in_progress", "approved", "completed"]) {
      expect(isTodaysPermit({ status, opened_at: opened }, now, tz)).toBe(true);
    }
  });

  it("frees the day once the permit is cancelled, rejected or expired", () => {
    for (const status of ["cancelled", "rejected", "expired"]) {
      expect(isTodaysPermit({ status, opened_at: opened }, now, tz)).toBe(false);
    }
  });

  it("does not count a permit left open from an earlier day", () => {
    const yesterday = "2027-02-15T00:10:00Z";
    expect(isTodaysPermit({ status: "in_progress", opened_at: yesterday }, now, tz)).toBe(false);
    expect(isTodaysPermit({ status: "approved", opened_at: yesterday }, now, tz)).toBe(false);
  });
});

describe("permitLessonsOver", () => {
  const tz = "Asia/Jakarta";
  const permit = { opened_at: "2027-02-16T00:10:00Z" }; // 07:10 in Jakarta
  const end = { ends_at: "09:00:00" };

  it("is over once the last lesson has ended on the school's clock", () => {
    expect(permitLessonsOver(permit, end, new Date("2027-02-16T01:59:00Z"), tz)).toBe(false);
    expect(permitLessonsOver(permit, end, new Date("2027-02-16T02:00:00Z"), tz)).toBe(true);
  });

  it("is over for a permit from an earlier day, whatever the time now", () => {
    expect(permitLessonsOver(permit, end, new Date("2027-02-17T00:10:00Z"), tz)).toBe(true);
    expect(permitLessonsOver(permit, undefined, new Date("2027-02-17T00:10:00Z"), tz)).toBe(true);
  });

  it("is not over while the end lesson is unknown on the permit's own day", () => {
    expect(permitLessonsOver(permit, undefined, new Date("2027-02-16T08:00:00Z"), tz)).toBe(false);
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

  it("stops counting once the exit day is over with no return on record", () => {
    // 23:59 in Jakarta on the exit day: still out, late by the minutes.
    expect(exitReturnState(out, new Date("2027-02-16T16:59:00Z"), "Asia/Jakarta")).toMatchObject({
      kind: "out",
      lateMinutes: 779,
    });
    // 00:00 the next day in Jakarta: the gate can no longer record it.
    expect(exitReturnState(out, new Date("2027-02-16T17:00:00Z"), "Asia/Jakarta")).toEqual({
      kind: "unrecorded",
      due,
    });
    expect(exitReturnState(out, new Date("2027-02-20T03:00:00Z"), "Asia/Jakarta")).toEqual({
      kind: "unrecorded",
      due,
    });
  });

  it("keeps a return recorded on the exit day, whenever it is read", () => {
    const back = { ...out, returned_at: "2027-02-16T04:20:00Z" };
    expect(exitReturnState(back, new Date("2027-02-20T03:00:00Z"), "Asia/Jakarta")).toMatchObject({
      kind: "returned",
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
